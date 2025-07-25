import { Uint8ArrayReader, ZipReader, TextWriter } from '@zip.js/zip.js';
import { indexedDbService, type DictionaryEntry } from './indexedDbService';
import { dictionaryWorkerManager, type ProgressCallback } from './dictionaryWorkerManager';
import { dictionaryInitializer } from './dictionaryInitializer';

// Cache for the zip archive and index data (fallback only)
let cachedZipEntries: any[] | null = null;
let cachedIndexData: any = null;

// Performance optimizations  
let resultCache: Map<string, any[]> = new Map(); // word -> cached results

/**
 * Parse JSON with error handling
 */
function parseJson<T = unknown>(content: string): T {
    try {
        return JSON.parse(content);
    } catch (error) {
        console.error('Failed to parse JSON:', error);
        throw new Error('Invalid JSON format');
    }
}

/**
 * Get all entries from a zip archive
 */
export async function getDictionaryArchiveEntries(data: ArrayBuffer): Promise<any[]> {
    const zipFileReader = new Uint8ArrayReader(new Uint8Array(data));
    const zipReader = new ZipReader(zipFileReader);
    return await zipReader.getEntries();
}

/**
 * Find and parse a specific JSON file from the zip entries
 */
export async function getDictionaryArchiveJson<T = unknown>(entries: any[], fileName: string): Promise<T> {
    const entry = entries.find((item: any) => item.filename === fileName);
    if (!entry) {
        throw new Error(`File not found: ${fileName}`);
    }
    return await readArchiveEntryDataJson<T>(entry);
}

/**
 * Read entry data as string
 */
export async function readArchiveEntryDataString(entry: any): Promise<string> {
    if (!entry.getData) {
        throw new Error('Cannot get entry data');
    }
    return await entry.getData(new TextWriter());
}

/**
 * Read entry data as parsed JSON
 */
export async function readArchiveEntryDataJson<T = unknown>(entry: any): Promise<T> {
    const content = await readArchiveEntryDataString(entry);
    return parseJson<T>(content);
}

/**
 * Load Jitendex dictionary with optimizations
 * @deprecated Use dictionaryInitializer.initialize() instead
 */
export async function loadJitendexDictionary(progressCallback?: ProgressCallback): Promise<void> {
    console.warn('loadJitendexDictionary is deprecated. Use dictionaryInitializer.initialize() instead.');
    return dictionaryInitializer.initialize(progressCallback);
}

/**
 * Legacy loading system (for fallback only)
 */
async function loadLegacySystem(arrayBuffer: ArrayBuffer): Promise<void> {
    const entries = await getDictionaryArchiveEntries(arrayBuffer);
    
    // Cache the zip entries for later use
    cachedZipEntries = entries;
    
    // Load the index file
    const indexData = await getDictionaryArchiveJson(entries, 'index.json');
    cachedIndexData = indexData;
    
    console.log(`📚 Legacy dictionary loaded: ${entries.length} files in archive`);
}

/**
 * Bulk search for terms across multiple term banks (Yomitan-style optimization)
 */
async function findTermsBulk(termList: string[], termBankFiles: any[], zipEntries: any[]): Promise<any[]> {
    const visited = new Set<string>();
    const results: any[] = [];
    
    // Process all term banks (remove the slice limit)
    const searchPromises = termBankFiles.map(async (termBankEntry) => {
        try {
            // Load term bank data from zip
            const termBankData = await getDictionaryArchiveJson<any[]>(zipEntries, termBankEntry.filename);
            const bankResults: any[] = [];
            
            // Efficient bulk matching within this term bank
            for (const entry of termBankData) {
                // Jitendex format: [expression, reading, definition_tags, rules, frequency, definitions]
                const expression = entry[0];
                const reading = entry[1];
                
                // Check if any of the search terms match this entry
                const matchFound = termList.some(searchTerm => 
                    expression === searchTerm || reading === searchTerm
                );
                
                if (matchFound) {
                    // Create unique ID to prevent duplicates (like Yomitan does)
                    const entryId = `${expression}:${reading}:${termBankEntry.filename}`;
                    
                    if (!visited.has(entryId)) {
                        visited.add(entryId);
                        
                        bankResults.push({
                            term: expression,
                            reading: reading,
                            definitionTags: entry[2] || [],
                            rules: entry[3] || [], 
                            frequency: entry[4] || 0,
                            definitions: entry[5] || [],
                            source: termBankEntry.filename,
                            id: entryId
                        });
                    }
                }
            }
            
            return bankResults;
            
        } catch (error) {
            console.warn(`Error searching ${termBankEntry.filename}:`, error);
            return [];
        }
    });
    
    // Wait for all searches to complete and flatten results
    const allResults = await Promise.allSettled(searchPromises);
    
    for (const result of allResults) {
        if (result.status === 'fulfilled') {
            results.push(...result.value);
        }
    }
    
    return results;
}

/**
 * Look up a word in the Jitendex dictionary with optimizations
 */
export async function lookupJitendexWord(word: string): Promise<any[]> {
    try {
        // Check if offline parser is enabled
        const isOfflineParserEnabled = localStorage.getItem('useOfflineParser') === 'true';
        if (!isOfflineParserEnabled) {
            console.log('📱 Offline parser disabled, skipping dictionary lookup');
            return [];
        }

        // Start initialization if not started yet
        const status = dictionaryInitializer.getStatus();
        if (!status.isInitialized && !status.isInitializing && !status.error) {
            console.log('🔄 Starting dictionary initialization on first lookup...');
            dictionaryInitializer.initialize().catch(error => {
                console.error('Failed to initialize dictionary on lookup:', error);
            });
        }

        // Wait for dictionary initialization
        await dictionaryInitializer.waitForInitialization();
        
        // Check cache first
        if (resultCache.has(word)) {
            return resultCache.get(word)!;
        }
        
        // Use optimized lookup
        const results = await lookupOptimized(word);
        
        // Cache results
        resultCache.set(word, results);
        
        if (results.length > 0) {
            console.log(`✅ Found ${results.length} unique matches for "${word}"`);
        }
        
        return results;
        
    } catch (error) {
        console.error('Failed to lookup word in Jitendex:', error);
        return [];
    }
}

/**
 * Optimized lookup using worker
 */
async function lookupOptimized(word: string): Promise<any[]> {
    try {
        return await dictionaryWorkerManager.lookupTerm(word);
    } catch (error) {
        console.warn('Optimized lookup failed, falling back to legacy:', error);
        return await lookupLegacy(word);
    }
}

/**
 * Legacy lookup implementation
 */
async function lookupLegacy(word: string): Promise<any[]> {
    if (!cachedZipEntries) {
        return []; // Dictionary not available
    }
    
    // Find all term bank files in the archive
    const termBankFiles = cachedZipEntries.filter((entry: any) => 
        entry.filename.match(/^term_bank_\d+\.json$/)
    );
    
    // Sort term banks by number for consistent ordering
    termBankFiles.sort((a: any, b: any) => {
        const aNum = parseInt(a.filename.match(/\d+/)?.[0] || '0');
        const bNum = parseInt(b.filename.match(/\d+/)?.[0] || '0');
        return aNum - bNum;
    });
    
    // Use bulk search with the single word
    return await findTermsBulk([word], termBankFiles, cachedZipEntries);
}

/**
 * Batch lookup for multiple words (optimized for sentence-level processing)
 */
export async function lookupJitendexWordsBatch(words: string[]): Promise<{ [word: string]: any[] }> {
    try {
        // Check if offline parser is enabled
        const isOfflineParserEnabled = localStorage.getItem('useOfflineParser') === 'true';
        if (!isOfflineParserEnabled) {
            console.log('📱 Offline parser disabled, skipping batch dictionary lookup');
            return {};
        }

        if (words.length === 0) {
            return {};
        }

        // Start initialization if not started yet
        const status = dictionaryInitializer.getStatus();
        if (!status.isInitialized && !status.isInitializing && !status.error) {
            console.log('🔄 Starting dictionary initialization on first batch lookup...');
            dictionaryInitializer.initialize().catch(error => {
                console.error('Failed to initialize dictionary on batch lookup:', error);
            });
        }

        // Wait for dictionary initialization
        await dictionaryInitializer.waitForInitialization();
        
        // Use optimized batch lookup
        return await lookupBatchOptimized(words);
        
    } catch (error) {
        console.error('Failed to batch lookup words in Jitendex:', error);
        return {};
    }
}

/**
 * Optimized batch lookup using worker
 */
async function lookupBatchOptimized(words: string[]): Promise<{ [word: string]: any[] }> {
    try {
        return await dictionaryWorkerManager.lookupTermsBatch(words);
    } catch (error) {
        console.warn('Optimized batch lookup failed, falling back to legacy:', error);
        return await lookupBatchLegacy(words);
    }
}

/**
 * Legacy batch lookup implementation
 */
async function lookupBatchLegacy(words: string[]): Promise<{ [word: string]: any[] }> {
    if (!cachedZipEntries) {
        return {};
    }
    
    // Find all term bank files in the archive
    const termBankFiles = cachedZipEntries.filter((entry: any) => 
        entry.filename.match(/^term_bank_\d+\.json$/)
    );
    
    // Sort term banks by number for consistent ordering
    termBankFiles.sort((a: any, b: any) => {
        const aNum = parseInt(a.filename.match(/\d+/)?.[0] || '0');
        const bNum = parseInt(b.filename.match(/\d+/)?.[0] || '0');
        return aNum - bNum;
    });
    
    // Use bulk search for all words at once
    const allResults = await findTermsBulk(words, termBankFiles, cachedZipEntries);
    
    // Group results by search term
    const groupedResults: { [word: string]: any[] } = {};
    
    // Initialize empty arrays for each word
    words.forEach(word => {
        groupedResults[word] = [];
    });
    
    // Group results by matching word
    allResults.forEach(result => {
        words.forEach(word => {
            if (result.term === word || result.reading === word) {
                groupedResults[word].push(result);
            }
        });
    });
    
    const totalMatches = Object.values(groupedResults).reduce((sum, arr) => sum + arr.length, 0);
    if (totalMatches > 0) {
        console.log(`✅ Batch lookup: Found ${totalMatches} total matches for ${words.length} words`);
    }
    
    return groupedResults;
}

/**
 * Format Jitendex definition for display
 */
export function formatJitendexDefinition(entry: any): string {
    const { term, reading, definitions } = entry;
    
    let formatted = `**${term}**`;
    if (reading && reading !== term) {
        formatted += ` (${reading})`;
    }
    
    if (definitions && definitions.length > 0) {
        formatted += '\n\n';
        definitions.forEach((def: string, index: number) => {
            formatted += `${index + 1}. ${def}\n`;
        });
    }
    
    return formatted.trim();
}

/**
 * Check if Jitendex dictionary is available
 */
export function isJitendexAvailable(): boolean {
    return cachedZipEntries !== null && cachedIndexData !== null;
}

/**
 * Clear cached dictionary data
 */
export function clearJitendexCache(): void {
    cachedZipEntries = null;
    cachedIndexData = null;
    resultCache.clear();
    
    // Reset and clear all systems
    dictionaryInitializer.reset();
    
    console.log('Jitendex cache cleared');
}

/**
 * Get indexing progress information
 */
export function getIndexingProgress(): { stage: string; progress: number } | null {
    const status = dictionaryInitializer.getStatus();
    return status.progress || null;
}

/**
 * Check if optimized system is ready
 */
export function isOptimizedSystemReady(): boolean {
    return dictionaryInitializer.getStatus().isInitialized;
}

/**
 * Get dictionary statistics
 */
export async function getDictionaryStats(): Promise<{
    optimizedSystemEnabled: boolean;
    isOptimizedReady: boolean;
    isIndexing: boolean;
    indexingProgress?: { stage: string; progress: number };
    workerInitialized: boolean;
    cacheSize: number;
}> {
    const status = dictionaryInitializer.getStatus();
    
    return {
        optimizedSystemEnabled: true, // Always enabled now
        isOptimizedReady: status.isInitialized,
        isIndexing: status.isInitializing,
        indexingProgress: status.progress,
        workerInitialized: dictionaryWorkerManager.isInitialized(),
        cacheSize: resultCache.size
    };
}

/**
 * Enable or disable optimized system
 * @deprecated The optimized system is always enabled
 */
export function setOptimizedSystemEnabled(enabled: boolean): void {
    console.warn('setOptimizedSystemEnabled is deprecated. The optimized system is always enabled.');
}

/**
 * Force rebuild of optimized index
 */
export async function rebuildOptimizedIndex(progressCallback?: ProgressCallback): Promise<void> {
    console.log('🔄 Rebuilding optimized index...');
    return dictionaryInitializer.rebuild(progressCallback);
} 
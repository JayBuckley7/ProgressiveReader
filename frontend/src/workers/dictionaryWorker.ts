// Dictionary Web Worker for background processing
// This worker handles heavy dictionary operations off the main thread

import { Uint8ArrayReader, ZipReader, TextWriter } from '@zip.js/zip.js';

// Types for worker communication
export interface WorkerMessage {
  id: string;
  type: 'LOAD_DICTIONARY' | 'LOOKUP_TERM' | 'LOOKUP_BATCH' | 'BUILD_INDEX' | 'PROGRESS';
  payload?: any;
}

export interface WorkerResponse {
  id: string;
  type: 'SUCCESS' | 'ERROR' | 'PROGRESS';
  payload?: any;
  error?: string;
}

// In-memory optimized data structures
let termIndex: Map<string, string[]> | null = null; // term -> entry IDs
let entryCache: Map<string, any> | null = null; // entry ID -> entry data
let zipEntries: any[] | null = null;
let isIndexed = false;

/**
 * Parse JSON with error handling
 */
function parseJson<T = unknown>(content: string): T {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error('Worker: Failed to parse JSON:', error);
    throw new Error('Invalid JSON format');
  }
}

/**
 * Get all entries from a zip archive
 */
async function getDictionaryArchiveEntries(data: ArrayBuffer): Promise<any[]> {
  const zipFileReader = new Uint8ArrayReader(new Uint8Array(data));
  const zipReader = new ZipReader(zipFileReader);
  return await zipReader.getEntries();
}

/**
 * Read entry data as string
 */
async function readArchiveEntryDataString(entry: any): Promise<string> {
  if (!entry.getData) {
    throw new Error('Cannot get entry data');
  }
  return await entry.getData(new TextWriter());
}

/**
 * Read entry data as parsed JSON
 */
async function readArchiveEntryDataJson<T = unknown>(entry: any): Promise<T> {
  const content = await readArchiveEntryDataString(entry);
  return parseJson<T>(content);
}

/**
 * Build optimized search index and cache
 */
async function buildOptimizedIndex(): Promise<void> {
  if (!zipEntries) {
    throw new Error('Dictionary not loaded');
  }

  postMessage({
    id: 'build-index',
    type: 'PROGRESS',
    payload: { stage: 'starting', progress: 0 }
  } as WorkerResponse);

  // Initialize data structures
  termIndex = new Map();
  entryCache = new Map();

  // Find all term bank files
  const termBankFiles = zipEntries.filter((entry: any) => 
    entry.filename.match(/^term_bank_\d+\.json$/)
  );

  // Sort by number for consistent processing
  termBankFiles.sort((a: any, b: any) => {
    const aNum = parseInt(a.filename.match(/\d+/)?.[0] || '0');
    const bNum = parseInt(b.filename.match(/\d+/)?.[0] || '0');
    return aNum - bNum;
  });

  let processedFiles = 0;
  let totalEntries = 0;

  // Process each term bank file
  for (const termBankEntry of termBankFiles) {
    try {
      // Load term bank data from zip
      const termBankData = await readArchiveEntryDataJson<any[]>(termBankEntry);
      
      // Process each entry in the term bank
      for (let i = 0; i < termBankData.length; i++) {
        const entry = termBankData[i];
        
        // Jitendex format: [expression, reading, definition_tags, rules, frequency, definitions]
        const expression = entry[0];
        const reading = entry[1];
        const entryId = `${expression}:${reading}:${termBankEntry.filename}:${i}`;
        
        // Store entry in cache
        const processedEntry = {
          id: entryId,
          term: expression,
          reading: reading || expression,
          definitionTags: entry[2] || [],
          rules: entry[3] || [],
          frequency: entry[4] || 0,
          definitions: entry[5] || [],
          sourceFile: termBankEntry.filename
        };
        
        entryCache.set(entryId, processedEntry);
        
        // Index by term
        if (!termIndex.has(expression)) {
          termIndex.set(expression, []);
        }
        termIndex.get(expression)!.push(entryId);
        
        // Index by reading if different
        if (reading && reading !== expression) {
          if (!termIndex.has(reading)) {
            termIndex.set(reading, []);
          }
          termIndex.get(reading)!.push(entryId);
        }
        
        totalEntries++;
      }
      
      processedFiles++;
      
      // Send progress updates
      const progress = (processedFiles / termBankFiles.length) * 100;
      postMessage({
        id: 'build-index',
        type: 'PROGRESS',
        payload: { 
          stage: 'processing', 
          progress,
          processedFiles,
          totalFiles: termBankFiles.length,
          totalEntries
        }
      } as WorkerResponse);
      
    } catch (error) {
      console.warn(`Worker: Error processing ${termBankEntry.filename}:`, error);
    }
  }

  isIndexed = true;

  postMessage({
    id: 'build-index',
    type: 'SUCCESS',
    payload: { 
      stage: 'complete',
      progress: 100,
      totalEntries,
      totalTerms: termIndex.size,
      indexedFiles: processedFiles
    }
  } as WorkerResponse);
}

/**
 * Fast lookup using in-memory index
 */
function lookupTerm(term: string): any[] {
  if (!isIndexed || !termIndex || !entryCache) {
    throw new Error('Dictionary index not built');
  }

  const entryIds = termIndex.get(term) || [];
  const results: any[] = [];

  for (const entryId of entryIds) {
    const entry = entryCache.get(entryId);
    if (entry) {
      results.push(entry);
    }
  }

  return results;
}

/**
 * Batch lookup for multiple terms
 */
function lookupTermsBatch(terms: string[]): { [term: string]: any[] } {
  const results: { [term: string]: any[] } = {};
  
  for (const term of terms) {
    results[term] = lookupTerm(term);
  }
  
  return results;
}

/**
 * Load dictionary from zip file
 */
async function loadDictionary(arrayBuffer: ArrayBuffer): Promise<void> {
  try {
    // Load zip entries
    zipEntries = await getDictionaryArchiveEntries(arrayBuffer);
    
    postMessage({
      id: 'load-dictionary',
      type: 'SUCCESS',
      payload: { 
        loaded: true,
        totalFiles: zipEntries.length
      }
    } as WorkerResponse);

  } catch (error) {
    postMessage({
      id: 'load-dictionary',
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    } as WorkerResponse);
  }
}

// Worker message handler
self.onmessage = async (event) => {
  const message: WorkerMessage = event.data;
  
  try {
    switch (message.type) {
      case 'LOAD_DICTIONARY':
        await loadDictionary(message.payload.arrayBuffer);
        break;
        
      case 'BUILD_INDEX':
        await buildOptimizedIndex();
        break;
        
      case 'LOOKUP_TERM':
        {
          const results = lookupTerm(message.payload.term);
          postMessage({
            id: message.id,
            type: 'SUCCESS',
            payload: { results }
          } as WorkerResponse);
          break;
        }
        
      case 'LOOKUP_BATCH':
        {
          const batchResults = lookupTermsBatch(message.payload.terms);
          postMessage({
            id: message.id,
            type: 'SUCCESS',
            payload: { results: batchResults }
          } as WorkerResponse);
          break;
        }
        
      default:
        postMessage({
          id: message.id,
          type: 'ERROR',
          error: `Unknown message type: ${message.type}`
        } as WorkerResponse);
    }
  } catch (error) {
    postMessage({
      id: message.id,
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    } as WorkerResponse);
  }
};

// Handle uncaught errors
self.onerror = (error) => {
  console.error('Dictionary worker error:', error);
};

export {}; // Make this a module 

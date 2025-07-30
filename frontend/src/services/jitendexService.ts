import { googleTranslateService, type GoogleTranslateResult } from './googleTranslateService';

// Cache for translation results
let resultCache: Map<string, GoogleTranslateResult> = new Map();

/**
 * Look up a word using Google Translate instead of dictionary
 */
export async function lookupJitendexWord(word: string): Promise<GoogleTranslateResult[]> {
  try {
    // Check if JPDB API key is available - if yes, skip Google Translate cache
    const jpdbApiKey = document.cookie.match(/jpdbApiKey=([^;]+)/)?.[1] || "";
    if (jpdbApiKey) {
      console.log('📱 JPDB API key available, skipping Google Translate cache lookup');
      return [];
    }

    // Check if Google Translate is available
    if (!googleTranslateService.isConfigured()) {
      console.warn('⚠️ Google Translate not configured for Jitendex lookup');
      return [];
    }
    
    // Check cache first
    const cacheKey = word;
    if (resultCache.has(cacheKey)) {
      const cached = resultCache.get(cacheKey)!;
      return [cached];
    }
    
    // Use Google Translate to translate the word
    const result = await googleTranslateService.translateWithAutoDetect(word);
    
    // Cache results
    resultCache.set(cacheKey, result);
    
    if (result.translation && !result.translation.includes('[Translation error')) {
      console.log(`✅ Found translation for "${word}": "${result.translation}"`);
      return [result];
    }
    
    return [];
    
  } catch (error) {
    console.error('Failed to lookup word with Lingva:', error);
    return [];
  }
}

/**
 * Batch lookup for multiple words using Google Translate
 */
export async function lookupJitendexWordsBatch(words: string[]): Promise<{ [word: string]: GoogleTranslateResult[] }> {
  try {
    // Check if JPDB API key is available - if yes, skip Google Translate cache
    const jpdbApiKey = document.cookie.match(/jpdbApiKey=([^;]+)/)?.[1] || "";
    if (jpdbApiKey) {
      console.log('📱 JPDB API key available, skipping Google Translate batch cache lookup');
      return {};
    }

    if (words.length === 0) {
      return {};
    }

    // Check if Google Translate is available
    if (!googleTranslateService.isConfigured()) {
      console.warn('⚠️ Google Translate not configured for Jitendex lookup');
      return {};
    }
    
    // Use Google Translate batch translation
    const results = await googleTranslateService.translateBatch(words);
    
    // Group results by word
    const groupedResults: { [word: string]: GoogleTranslateResult[] } = {};
    
    words.forEach((word, index) => {
      const result = results[index];
      if (result && result.translation && !result.translation.includes('[Translation error')) {
        groupedResults[word] = [result];
        // Cache individual results
        resultCache.set(word, result);
      } else {
        groupedResults[word] = [];
      }
    });
    
    const totalMatches = Object.values(groupedResults).reduce((sum, arr) => sum + arr.length, 0);
    if (totalMatches > 0) {
      console.log(`✅ Batch translation: Found ${totalMatches} total translations for ${words.length} words`);
    }
    
    return groupedResults;
    
  } catch (error) {
    console.error('Failed to batch lookup words with Lingva:', error);
    return {};
  }
}

/**
 * Format Google Translate translation for display
 */
export function formatJitendexDefinition(entry: GoogleTranslateResult): string {
  const { original, translation } = entry;
  
  let formatted = `**${original}**`;
  
  if (translation && translation !== original) {
    formatted += `\n\n${translation}`;
  }
  
  return formatted.trim();
}

/**
 * Check if Google Translate service is available
 */
export function isJitendexAvailable(): boolean {
  return true; // Google Translate is available if API key is configured
}

/**
 * Clear cached translation data
 */
export function clearJitendexCache(): void {
  resultCache.clear();
  googleTranslateService.clearCache();
  

  
  console.log('Translation cache cleared');
}

/**
 * Get translation progress information (simplified for Google Translate)
 */
export function getIndexingProgress(): { stage: string; progress: number } | null {
  // Google Translate doesn't have indexing progress - always ready
  return null;
}

/**
 * Check if translation system is ready
 */
export function isOptimizedSystemReady(): boolean {
  return googleTranslateService.isConfigured();
}

/**
 * Get translation statistics
 */
export async function getDictionaryStats(): Promise<{
  optimizedSystemEnabled: boolean;
  isOptimizedReady: boolean;
  isIndexing: boolean;
  indexingProgress?: { stage: string; progress: number };
  workerInitialized: boolean;
  cacheSize: number;
}> {
  const googleTranslateStats = googleTranslateService.getCacheStats();
  
  return {
    optimizedSystemEnabled: true,
    isOptimizedReady: googleTranslateService.isConfigured(),
    isIndexing: false, // Google Translate doesn't have indexing
    indexingProgress: undefined,
    workerInitialized: true, // Always true for Google Translate
    cacheSize: resultCache.size + googleTranslateStats.size
  };
}

/**
 * Enable or disable translation system (kept for compatibility)
 */
export function setOptimizedSystemEnabled(enabled: boolean): void {
  console.log(`Translation system ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Force rebuild of translation cache
 */
export async function rebuildOptimizedIndex(): Promise<void> {
  console.log('🔄 Clearing translation cache...');
  clearJitendexCache();
  console.log('✅ Translation cache cleared');
} 
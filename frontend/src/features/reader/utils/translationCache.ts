/**
 * LRU Cache for translation results to avoid duplicate API calls
 */
import { appLog } from '@shared/appLog'
export class TranslationCache {
  private cache = new Map<string, string>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(word: string): string | undefined {
    const translation = this.cache.get(word);
    if (translation !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(word);
      this.cache.set(word, translation);
    }
    return translation;
  }

  set(word: string, translation: string): void {
    // Remove if exists (to re-add at end)
    if (this.cache.has(word)) {
      this.cache.delete(word);
    } 
    // Remove oldest if at capacity
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(word, translation);
  }

  has(word: string): boolean {
    return this.cache.has(word);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Get cache hit rate for performance monitoring
  getStats(): { size: number; maxSize: number } {
    return { 
      size: this.cache.size, 
      maxSize: this.maxSize 
    };
  }
}

// Global cache instance
export const translationCache = new TranslationCache(1000);

// Utility functions for cache management
export const clearTranslationCache = () => {
  translationCache.clear();
  appLog.debug('🗑️ Translation cache cleared');
};

export const getTranslationCacheStats = () => {
  return translationCache.getStats();
};

// Optional: Auto-clear cache when it gets too large (memory management)
const AUTO_CLEAR_THRESHOLD = 2000;
export const checkCacheSize = () => {
  const stats = translationCache.getStats();
  if (stats.size > AUTO_CLEAR_THRESHOLD) {
    console.warn(`⚠️ Cache size (${stats.size}) exceeded threshold (${AUTO_CLEAR_THRESHOLD}), clearing...`);
    translationCache.clear();
  }
};


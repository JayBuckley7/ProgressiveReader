// Google Cloud Platform Translate API Service
export interface GoogleTranslateResult {
  translation: string;
  source: string;
  target: string;
  original: string;
  confidence?: number;
}

class GoogleTranslateService {
  private translationCache = new Map<string, GoogleTranslateResult>();

  /**
   * Set the Google Translate API key (not needed for backend calls, but kept for compatibility)
   */
  setApiKey(key: string): void {
    console.log('✅ Google Translate configured to use backend service');
  }

  /**
   * Translate text using the backend Google Translate API
   */
  async translateText(
    text: string,
    sourceLang: string = 'auto',
    targetLang: string = 'en'
  ): Promise<GoogleTranslateResult> {
    // Create cache key
    const cacheKey = `${sourceLang}-${targetLang}-${text}`;
    
    // Check cache first
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey)!;
    }

    try {
      // Clean and prepare text
      const cleanText = text.trim();
      if (!cleanText) {
        throw new Error('Empty text cannot be translated');
      }

      console.log(`🔄 Translating "${cleanText}" from ${sourceLang} to ${targetLang} using backend Google Translate`);
      
      // Map language codes to full names for backend
      const langMapping = {
        'en': 'English',
        'ja': 'Japanese',
        'zh': 'Chinese',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'ko': 'Korean',
        'ru': 'Russian',
        'pt': 'Portuguese',
        'it': 'Italian',
        'auto': undefined // Don't send source for auto-detect
      };

      const targetLanguage = langMapping[targetLang] || 'English';
      const sourceLanguage = sourceLang === 'auto' ? undefined : langMapping[sourceLang];

      // Call backend vocabulary translation endpoint
      const response = await fetch('/api/translate/vocabulary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: cleanText,
          target_lang: targetLanguage,
          source_lang: sourceLanguage,
          translation_service: 'google'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`Backend Google Translate error: ${response.status} ${response.statusText}${errorData?.error ? ` - ${errorData.error}` : ''}`);
      }

      const data = await response.json();
      
      if (!data.translated_text) {
        throw new Error('Invalid response from backend Google Translate API');
      }

      const result: GoogleTranslateResult = {
        translation: data.translated_text,
        source: sourceLang,
        target: targetLang,
        original: cleanText
      };

      // Cache the result
      this.translationCache.set(cacheKey, result);
      
      console.log(`✅ Backend Translation: "${cleanText}" → "${result.translation}"`);
      
      return result;

    } catch (error) {
      console.error('Backend Google Translate error:', error);
      
      // Return fallback result
      return {
        translation: `[Translation error: ${error.message}]`,
        source: sourceLang,
        target: targetLang,
        original: text
      };
    }
  }

  /**
   * Translate Japanese text to English (common use case)
   */
  async translateJapaneseToEnglish(text: string): Promise<GoogleTranslateResult> {
    return this.translateText(text, 'ja', 'en');
  }

  /**
   * Translate with language auto-detection
   */
  async translateWithAutoDetect(text: string, targetLang: string = 'en'): Promise<GoogleTranslateResult> {
    return this.translateText(text, 'auto', targetLang);
  }

  /**
   * Batch translate multiple texts using backend batch endpoint
   */
  async translateBatch(
    texts: string[],
    sourceLang: string = 'auto',
    targetLang: string = 'en'
  ): Promise<GoogleTranslateResult[]> {
    try {
      console.log(`🔄 Batch translating ${texts.length} items using backend Google Translate`);

      // Map language codes to full names for backend
      const langMapping = {
        'en': 'English',
        'ja': 'Japanese',
        'zh': 'Chinese',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'ko': 'Korean',
        'ru': 'Russian',
        'pt': 'Portuguese',
        'it': 'Italian'
      };

      const targetLanguage = langMapping[targetLang] || 'English';

      // Call backend batch translation endpoint
      const response = await fetch('/api/translate/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          words: texts,
          target_lang: targetLanguage,
          translation_service: 'google'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`Backend batch translate error: ${response.status} ${errorData?.error || response.statusText}`);
      }

      const data = await response.json();

      if (!data.translations || !Array.isArray(data.translations)) {
        throw new Error('Invalid response from backend batch translate API');
      }

      // Convert backend response to GoogleTranslateResult format
      const results: GoogleTranslateResult[] = texts.map((text, index) => {
        const translation = data.translations[index];
        return {
          translation: translation || `[Translation error: No result for "${text}"]`,
          source: sourceLang,
          target: targetLang,
          original: text
        };
      });

      console.log(`✅ Batch translation completed: ${results.length} items`);
      
      return results;

    } catch (error) {
      console.error('Backend batch translate error:', error);
      
      // Return fallback results
      return texts.map(text => ({
        translation: `[Translation error: ${error.message}]`,
        source: sourceLang,
        target: targetLang,
        original: text
      }));
    }
  }

  /**
   * Clear translation cache
   */
  clearCache(): void {
    this.translationCache.clear();
    console.log('🗑️ Google Translate cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.translationCache.size,
      keys: Array.from(this.translationCache.keys())
    };
  }

  /**
   * Check if Google Translate service is available (checks backend)
   */
  async checkServiceHealth(): Promise<boolean> {
    try {
      const result = await this.translateText('hello', 'en', 'ja');
      return result.translation !== undefined && !result.translation.includes('[Translation error');
    } catch (error) {
      console.warn('Backend Google Translate service health check failed:', error);
      return false;
    }
  }

  /**
   * Check if service is configured (always true for backend calls)
   */
  isConfigured(): boolean {
    // Backend handles the API key, so this is always true
    return true;
  }

  /**
   * Store API key in localStorage (no longer needed for backend calls)
   */
  storeApiKey(key: string): void {
    console.log('✅ Google Translate configured to use backend service (API key not stored locally)');
  }

  /**
   * Remove API key from localStorage (no longer needed for backend calls)
   */
  removeStoredApiKey(): void {
    console.log('✅ Google Translate using backend service (no local API key to remove)');
  }
}

// Export singleton instance
export const googleTranslateService = new GoogleTranslateService(); 
// Google Cloud Platform Translate API Service
export interface GoogleTranslateResult {
  translation: string;
  source: string;
  target: string;
  original: string;
  confidence?: number;
}

class GoogleTranslateService {
  private readonly baseUrl = 'https://translation.googleapis.com/language/translate/v2';
  private translationCache = new Map<string, GoogleTranslateResult>();
  private apiKey: string | null = null;

  /**
   * Set the Google Translate API key
   */
  setApiKey(key: string): void {
    this.apiKey = key;
    console.log('✅ Google Translate API key configured');
  }

  /**
   * Get API key from environment or localStorage
   */
  private getApiKey(): string {
    // Try environment variable first
    if (import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY) {
      return import.meta.env.VITE_GOOGLE_TRANSLATE_API_KEY;
    }
    
    // Try localStorage
    const storedKey = localStorage.getItem('googleTranslateApiKey');
    if (storedKey) {
      return storedKey;
    }

    // Use the manually set key
    if (this.apiKey) {
      return this.apiKey;
    }

    throw new Error('Google Translate API key not found. Please set VITE_GOOGLE_TRANSLATE_API_KEY environment variable or configure it in settings.');
  }

  /**
   * Translate text using Google Cloud Translate API
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

      // Get API key
      const apiKey = this.getApiKey();
      
      console.log(`🔄 Translating "${cleanText}" from ${sourceLang} to ${targetLang} using Google Translate`);
      
      // Prepare request body
      const requestBody: any = {
        q: cleanText,
        target: targetLang
      };

      // Only add source if it's not auto-detect
      if (sourceLang !== 'auto') {
        requestBody.source = sourceLang;
      }

      // Make API request
      const response = await fetch(`${this.baseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(`Google Translate API error: ${response.status} ${response.statusText}${errorData ? ` - ${errorData.error?.message || ''}` : ''}`);
      }

      const data = await response.json();
      
      if (!data.data?.translations?.[0]) {
        throw new Error('Invalid response from Google Translate API');
      }

      const translation = data.data.translations[0];
      const detectedSourceLang = translation.detectedSourceLanguage || sourceLang;

      const result: GoogleTranslateResult = {
        translation: translation.translatedText,
        source: detectedSourceLang,
        target: targetLang,
        original: cleanText,
        confidence: translation.confidence
      };

      // Cache the result
      this.translationCache.set(cacheKey, result);
      
      console.log(`✅ Translation: "${cleanText}" → "${result.translation}" (detected: ${detectedSourceLang})`);
      
      return result;

    } catch (error) {
      console.error('Google Translate error:', error);
      
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
   * Batch translate multiple texts
   */
  async translateBatch(
    texts: string[],
    sourceLang: string = 'auto',
    targetLang: string = 'en'
  ): Promise<GoogleTranslateResult[]> {
    // For now, do sequential translations to avoid rate limits
    // In production, you might want to use the batch API endpoint
    const promises = texts.map(text => this.translateText(text, sourceLang, targetLang));
    return Promise.all(promises);
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
   * Check if Google Translate service is available
   */
  async checkServiceHealth(): Promise<boolean> {
    try {
      const result = await this.translateText('hello', 'en', 'ja');
      return result.translation !== undefined && !result.translation.includes('[Translation error');
    } catch (error) {
      console.warn('Google Translate service health check failed:', error);
      return false;
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    try {
      this.getApiKey();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Store API key in localStorage
   */
  storeApiKey(key: string): void {
    localStorage.setItem('googleTranslateApiKey', key);
    this.apiKey = key;
    console.log('✅ Google Translate API key stored');
  }

  /**
   * Remove API key from localStorage
   */
  removeStoredApiKey(): void {
    localStorage.removeItem('googleTranslateApiKey');
    this.apiKey = null;
    console.log('🗑️ Google Translate API key removed');
  }
}

// Export singleton instance
export const googleTranslateService = new GoogleTranslateService(); 
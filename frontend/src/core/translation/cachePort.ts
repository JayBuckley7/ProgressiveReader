export type TranslationCacheEntry = {
  content: string;
  timestamp: number;
  useCefr: boolean;
  targetLanguage: string;
  cefrLevel: string;
};

export interface TranslationCachePort {
  get(bookId: string, chapter: number): TranslationCacheEntry | null;
  set(bookId: string, chapter: number, entry: TranslationCacheEntry): void;
  remove(bookId: string, chapter: number): void;
}


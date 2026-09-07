export type TranslationCacheEntry = {
  content: string;
  timestamp: number;
  useCefr: boolean;
  targetLanguage: string;
  cefrLevel: string;
};

export const SEGMENT_TRANSLATION_CACHE_VERSION = 2 as const;

export type TranslationSegmentCacheKey = {
  bookId: string;
  chapter: number;
  segmentId: string;
  sourceHash: string;
  model: string;
  targetLanguage: string;
  useCefr: boolean;
  cefrLevel: string;
  promptVersion: string;
};

export type TranslationSegmentCacheRecord = {
  version: typeof SEGMENT_TRANSLATION_CACHE_VERSION;
  key: TranslationSegmentCacheKey;
  translatedHtml: string;
  timestamp: number;
  modelUsed?: string;
};

export interface SegmentTranslationCachePort {
  get(key: TranslationSegmentCacheKey): Promise<TranslationSegmentCacheRecord | null>;
  getMany(keys: readonly TranslationSegmentCacheKey[]): Promise<Array<TranslationSegmentCacheRecord | null>>;
  put(record: TranslationSegmentCacheRecord): Promise<void>;
  putMany(records: readonly TranslationSegmentCacheRecord[]): Promise<void>;
  remove(key: TranslationSegmentCacheKey): Promise<void>;
  removeChapter(bookId: string, chapter: number): Promise<void>;
  clear(): Promise<void>;
}

export interface TranslationCachePort {
  get(bookId: string, chapter: number): TranslationCacheEntry | null;
  set(bookId: string, chapter: number, entry: TranslationCacheEntry): void;
  remove(bookId: string, chapter: number): void;

  /**
   * Content-addressed v2 cache. Optional so existing dependency mocks and the
   * synchronous chapter-cache contract remain backwards compatible.
   */
  readonly segments?: SegmentTranslationCachePort;
}


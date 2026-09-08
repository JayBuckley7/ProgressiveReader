import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import {
  normalizeTranslationSegmentCacheKey,
  serializeTranslationSegmentCacheKey,
} from "@core/translation/cache";
import {
  SEGMENT_TRANSLATION_CACHE_VERSION,
  type SegmentTranslationCachePort,
  type TranslationCacheEntry,
  type TranslationCachePort,
  type TranslationSegmentCacheKey,
  type TranslationSegmentCacheRecord,
} from "@core/translation/cachePort";

export const TRANSLATION_CACHE_DB_NAME = "progressive-reader-translation-cache";
export const TRANSLATION_CACHE_DB_VERSION = 2;

const SEGMENT_STORE = "segmentTranslations" as const;
const BOOK_CHAPTER_INDEX = "byBookChapter" as const;

type StoredSegmentTranslation = {
  cacheId: string;
  version: typeof SEGMENT_TRANSLATION_CACHE_VERSION;
  bookId: string;
  chapter: number;
  segmentId: string;
  sourceHash: string;
  model: string;
  targetLanguage: string;
  useCefr: boolean;
  cefrLevel: string;
  promptVersion: string;
  translatedHtml: string;
  timestamp: number;
  modelUsed?: string;
};

interface TranslationCacheDb extends DBSchema {
  segmentTranslations: {
    key: string;
    value: StoredSegmentTranslation;
    indexes: {
      byBookChapter: [string, number];
    };
  };
}

function keyFor(bookId: string, chapter: number): string {
  return `translation_${bookId}_${chapter}`;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toStored(record: TranslationSegmentCacheRecord): StoredSegmentTranslation {
  const key = normalizeTranslationSegmentCacheKey(record.key);
  return {
    cacheId: serializeTranslationSegmentCacheKey(key),
    version: SEGMENT_TRANSLATION_CACHE_VERSION,
    ...key,
    translatedHtml: record.translatedHtml,
    timestamp: record.timestamp,
    ...(record.modelUsed ? { modelUsed: record.modelUsed } : {}),
  };
}

function fromStored(value: StoredSegmentTranslation | undefined): TranslationSegmentCacheRecord | null {
  if (
    !value ||
    value.version !== SEGMENT_TRANSLATION_CACHE_VERSION ||
    typeof value.translatedHtml !== "string" ||
    !value.translatedHtml.trim()
  ) {
    return null;
  }

  const key = normalizeTranslationSegmentCacheKey({
    bookId: value.bookId,
    chapter: value.chapter,
    segmentId: value.segmentId,
    sourceHash: value.sourceHash,
    model: value.model,
    targetLanguage: value.targetLanguage,
    useCefr: value.useCefr,
    cefrLevel: value.cefrLevel,
    promptVersion: value.promptVersion,
  });
  if (value.cacheId !== serializeTranslationSegmentCacheKey(key)) return null;

  return {
    version: SEGMENT_TRANSLATION_CACHE_VERSION,
    key,
    translatedHtml: value.translatedHtml,
    timestamp: value.timestamp,
    ...(value.modelUsed ? { modelUsed: value.modelUsed } : {}),
  };
}

export function createSegmentTranslationCachePort(): SegmentTranslationCachePort {
  let dbPromise: Promise<IDBPDatabase<TranslationCacheDb> | null> | null = null;

  const getDb = (): Promise<IDBPDatabase<TranslationCacheDb> | null> => {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = openDB<TranslationCacheDb>(
        TRANSLATION_CACHE_DB_NAME,
        TRANSLATION_CACHE_DB_VERSION,
        {
          upgrade(db, _oldVersion, _newVersion, transaction) {
            const store = db.objectStoreNames.contains(SEGMENT_STORE)
              ? transaction.objectStore(SEGMENT_STORE)
              : db.createObjectStore(SEGMENT_STORE, { keyPath: "cacheId" });
            if (!store.indexNames.contains(BOOK_CHAPTER_INDEX)) {
              store.createIndex(BOOK_CHAPTER_INDEX, ["bookId", "chapter"]);
            }
          },
        }
      ).catch(() => null);
    }
    return dbPromise;
  };

  return {
    async get(key: TranslationSegmentCacheKey): Promise<TranslationSegmentCacheRecord | null> {
      try {
        const db = await getDb();
        if (!db) return null;
        return fromStored(await db.get(SEGMENT_STORE, serializeTranslationSegmentCacheKey(key)));
      } catch {
        return null;
      }
    },

    async getMany(
      keys: readonly TranslationSegmentCacheKey[]
    ): Promise<Array<TranslationSegmentCacheRecord | null>> {
      try {
        const db = await getDb();
        if (!db) return keys.map(() => null);
        return await Promise.all(
          keys.map(async (key) =>
            fromStored(await db.get(SEGMENT_STORE, serializeTranslationSegmentCacheKey(key)))
          )
        );
      } catch {
        return keys.map(() => null);
      }
    },

    async put(record: TranslationSegmentCacheRecord): Promise<void> {
      try {
        const db = await getDb();
        if (
          !db ||
          record.version !== SEGMENT_TRANSLATION_CACHE_VERSION ||
          !record.translatedHtml?.trim()
        ) {
          return;
        }
        await db.put(SEGMENT_STORE, toStored(record));
      } catch {
        // A cache failure must not fail the translation itself.
      }
    },

    async putMany(records: readonly TranslationSegmentCacheRecord[]): Promise<void> {
      try {
        const db = await getDb();
        if (!db) return;
        await Promise.all(
          records
            .filter(
              (record) =>
                record.version === SEGMENT_TRANSLATION_CACHE_VERSION &&
                Boolean(record.translatedHtml?.trim())
            )
            .map((record) => db.put(SEGMENT_STORE, toStored(record)))
        );
      } catch {
        // A cache failure must not fail the translation itself.
      }
    },

    async remove(key: TranslationSegmentCacheKey): Promise<void> {
      try {
        const db = await getDb();
        if (!db) return;
        await db.delete(SEGMENT_STORE, serializeTranslationSegmentCacheKey(key));
      } catch {
        // ignore
      }
    },

    async removeChapter(bookId: string, chapter: number): Promise<void> {
      try {
        const db = await getDb();
        if (!db) return;
        const normalizedChapter = Math.trunc(chapter);
        const keys = await db.getAllKeysFromIndex(
          SEGMENT_STORE,
          BOOK_CHAPTER_INDEX,
          [bookId.trim(), normalizedChapter]
        );
        await Promise.all(keys.map((key) => db.delete(SEGMENT_STORE, key)));
      } catch {
        // ignore
      }
    },

    async clear(): Promise<void> {
      try {
        const db = await getDb();
        if (!db) return;
        await db.clear(SEGMENT_STORE);
      } catch {
        // ignore
      }
    },
  };
}

export function createTranslationCachePort(): TranslationCachePort & {
  readonly segments: SegmentTranslationCachePort;
} {
  const segments = createSegmentTranslationCachePort();
  return {
    get(bookId: string, chapter: number): TranslationCacheEntry | null {
      try {
        if (typeof window === "undefined") return null;
        const raw = localStorage.getItem(keyFor(bookId, chapter));
        const parsed = safeJsonParse<Record<string, unknown>>(raw);
        const content = typeof parsed?.content === "string" ? parsed.content : "";
        if (!content.trim()) return null;
        return {
          content,
          timestamp: typeof parsed?.timestamp === "number" ? parsed.timestamp : 0,
          useCefr: Boolean(parsed?.useCefr),
          targetLanguage: typeof parsed?.targetLanguage === "string" ? parsed.targetLanguage : "English",
          cefrLevel: typeof parsed?.cefrLevel === "string" ? parsed.cefrLevel : "",
        };
      } catch {
        return null;
      }
    },

    set(bookId: string, chapter: number, entry: TranslationCacheEntry): void {
      try {
        if (typeof window === "undefined") return;
        localStorage.setItem(keyFor(bookId, chapter), JSON.stringify(entry));
      } catch {
        // ignore
      }
    },

    remove(bookId: string, chapter: number): void {
      try {
        if (typeof window === "undefined") return;
        localStorage.removeItem(keyFor(bookId, chapter));
      } catch {
        // ignore
      }
    },

    segments,
  };
}


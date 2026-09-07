import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const idbMock = vi.hoisted(() => ({
  openDB: vi.fn(),
}));

vi.mock("idb", () => ({ openDB: idbMock.openDB }));

import {
  hashTranslationSource,
  makeTranslationSegmentCacheRecord,
  serializeTranslationSegmentCacheKey,
} from "@core/translation/cache";
import type { TranslationSegmentCacheKey } from "@core/translation/cachePort";
import {
  createTranslationCachePort,
  TRANSLATION_CACHE_DB_NAME,
  TRANSLATION_CACHE_DB_VERSION,
} from "@integrations/storage/translationCache";

const baseKey: TranslationSegmentCacheKey = {
  bookId: "book:1",
  chapter: 2,
  segmentId: "segment|1",
  sourceHash: "ABC123",
  model: "gpt-test",
  targetLanguage: "English",
  useCefr: true,
  cefrLevel: "b2",
  promptVersion: "segment-v1",
};

const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");

describe("segment translation cache", () => {
  let stored: Map<string, any>;

  beforeEach(() => {
    stored = new Map();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {},
    });

    const createIndex = vi.fn();
    const createObjectStore = vi.fn(() => ({
      createIndex,
      indexNames: { contains: () => false },
    }));
    const fakeDb = {
      objectStoreNames: { contains: () => false },
      createObjectStore,
      get: vi.fn(async (_store: string, key: string) => stored.get(key)),
      put: vi.fn(async (_store: string, value: any) => {
        stored.set(value.cacheId, value);
        return value.cacheId;
      }),
      delete: vi.fn(async (_store: string, key: string) => {
        stored.delete(key);
      }),
      getAllKeysFromIndex: vi.fn(
        async (_store: string, _index: string, query: [string, number]) =>
          Array.from(stored.values())
            .filter((value) => value.bookId === query[0] && value.chapter === query[1])
            .map((value) => value.cacheId)
      ),
      clear: vi.fn(async () => stored.clear()),
    };

    idbMock.openDB.mockReset();
    idbMock.openDB.mockImplementation(async (_name: string, _version: number, options: any) => {
      options?.upgrade?.(fakeDb);
      return fakeDb;
    });
    localStorage.clear();
  });

  afterEach(() => {
    if (originalIndexedDbDescriptor) {
      Object.defineProperty(globalThis, "indexedDB", originalIndexedDbDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "indexedDB");
    }
  });

  it("uses every translation dimension in a collision-safe key", () => {
    const serialized = serializeTranslationSegmentCacheKey(baseKey);
    expect(serialized).toContain('"book:1"');
    expect(serialized).toContain('"segment|1"');
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, bookId: "book:2" })).not.toBe(serialized);
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, chapter: 3 })).not.toBe(serialized);
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, segmentId: "segment|2" })).not.toBe(serialized);
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, sourceHash: "abc123" })).not.toBe(serialized);
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, model: "other-model" })).not.toBe(serialized);
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, targetLanguage: "Japanese" })).not.toBe(serialized);
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, cefrLevel: "C1" })).not.toBe(serialized);
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, useCefr: false })).not.toBe(serialized);
    expect(serializeTranslationSegmentCacheKey({ ...baseKey, promptVersion: "segment-v2" })).not.toBe(serialized);
  });

  it("stores and retrieves v2 records while retaining the legacy chapter cache", async () => {
    const cache = createTranslationCachePort();
    const record = makeTranslationSegmentCacheRecord({
      key: baseKey,
      translatedHtml: "<p>Translated</p>",
      modelUsed: "gpt-test-2026",
      timestamp: 42,
    });

    await cache.segments.put(record);
    await expect(cache.segments.get(baseKey)).resolves.toEqual(record);
    await expect(cache.segments.get({ ...baseKey, sourceHash: "changed" })).resolves.toBeNull();
    expect(idbMock.openDB).toHaveBeenCalledWith(
      TRANSLATION_CACHE_DB_NAME,
      TRANSLATION_CACHE_DB_VERSION,
      expect.any(Object)
    );

    cache.set("book:1", 2, {
      content: "<p>Legacy</p>",
      timestamp: 1,
      useCefr: false,
      targetLanguage: "English",
      cefrLevel: "",
    });
    expect(cache.get("book:1", 2)?.content).toBe("<p>Legacy</p>");
  });

  it("removes only the requested book chapter", async () => {
    const cache = createTranslationCachePort();
    const records = [
      makeTranslationSegmentCacheRecord({ key: baseKey, translatedHtml: "<p>one</p>" }),
      makeTranslationSegmentCacheRecord({
        key: { ...baseKey, segmentId: "segment-2" },
        translatedHtml: "<p>two</p>",
      }),
      makeTranslationSegmentCacheRecord({
        key: { ...baseKey, chapter: 3, segmentId: "segment-3" },
        translatedHtml: "<p>three</p>",
      }),
    ];
    await cache.segments.putMany(records);
    await cache.segments.removeChapter(baseKey.bookId, baseKey.chapter);

    await expect(cache.segments.get(baseKey)).resolves.toBeNull();
    await expect(cache.segments.get({ ...baseKey, segmentId: "segment-2" })).resolves.toBeNull();
    await expect(
      cache.segments.get({ ...baseKey, chapter: 3, segmentId: "segment-3" })
    ).resolves.toEqual(records[2]);
  });

  it("hashes identical source deterministically", async () => {
    const first = await hashTranslationSource("<p>source</p>");
    const second = await hashTranslationSource("<p>source</p>");
    const different = await hashTranslationSource("<p>changed</p>");
    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first).toMatch(/^(sha256|fnv1a64):/);
  });
});

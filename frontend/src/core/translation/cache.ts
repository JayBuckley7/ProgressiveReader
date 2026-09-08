import {
  SEGMENT_TRANSLATION_CACHE_VERSION,
  type TranslationCacheEntry,
  type TranslationSegmentCacheKey,
  type TranslationSegmentCacheRecord,
} from "@core/translation/cachePort";
import { SEGMENT_TRANSLATION_PROMPT_VERSION } from "@core/translation/segments";

export function isTranslationCacheValid(
  entry: TranslationCacheEntry,
  current: { targetLanguage: string; cefrLevel: string; useCefr?: boolean }
): boolean {
  if (!entry?.content?.trim()) return false;
  const targetLanguage = (current.targetLanguage || "English").trim() || "English";
  const cefrLevel = (current.cefrLevel || "").trim();
  return (
    entry.targetLanguage === targetLanguage &&
    (!entry.useCefr || entry.cefrLevel === cefrLevel) &&
    (current.useCefr === undefined || entry.useCefr === current.useCefr)
  );
}

export function makeTranslationCacheEntry(args: {
  content: string;
  useCefr: boolean;
  targetLanguage: string;
  cefrLevel: string;
}): TranslationCacheEntry {
  return {
    content: args.content,
    timestamp: Date.now(),
    useCefr: Boolean(args.useCefr),
    targetLanguage: (args.targetLanguage || "English").trim() || "English",
    cefrLevel: (args.cefrLevel || "").trim(),
  };
}

function requiredString(value: string, field: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${field} must be a non-empty string`);
  return normalized;
}

export function normalizeTranslationSegmentCacheKey(
  key: TranslationSegmentCacheKey
): TranslationSegmentCacheKey {
  const chapter = Math.trunc(Number(key.chapter));
  if (!Number.isFinite(chapter) || chapter < 0) {
    throw new TypeError("chapter must be a non-negative integer");
  }

  const useCefr = Boolean(key.useCefr);
  return {
    bookId: requiredString(key.bookId, "bookId"),
    chapter,
    segmentId: requiredString(key.segmentId, "segmentId"),
    sourceHash: requiredString(key.sourceHash, "sourceHash"),
    model: requiredString(key.model, "model"),
    targetLanguage: requiredString(key.targetLanguage || "English", "targetLanguage").toLowerCase(),
    useCefr,
    cefrLevel: useCefr ? String(key.cefrLevel || "").trim().toUpperCase() : "",
    promptVersion: requiredString(
      key.promptVersion || SEGMENT_TRANSLATION_PROMPT_VERSION,
      "promptVersion"
    ),
  };
}

/** JSON avoids delimiter collisions in book and segment identifiers. */
export function serializeTranslationSegmentCacheKey(key: TranslationSegmentCacheKey): string {
  const normalized = normalizeTranslationSegmentCacheKey(key);
  return JSON.stringify([
    SEGMENT_TRANSLATION_CACHE_VERSION,
    normalized.bookId,
    normalized.chapter,
    normalized.segmentId,
    normalized.sourceHash,
    normalized.model,
    normalized.targetLanguage,
    normalized.useCefr,
    normalized.cefrLevel,
    normalized.promptVersion,
  ]);
}

export function makeTranslationSegmentCacheRecord(args: {
  key: TranslationSegmentCacheKey;
  translatedHtml: string;
  modelUsed?: string;
  timestamp?: number;
}): TranslationSegmentCacheRecord {
  const translatedHtml = String(args.translatedHtml || "");
  if (!translatedHtml.trim()) {
    throw new TypeError("translatedHtml must be a non-empty string");
  }

  return {
    version: SEGMENT_TRANSLATION_CACHE_VERSION,
    key: normalizeTranslationSegmentCacheKey(args.key),
    translatedHtml,
    timestamp: Number.isFinite(args.timestamp) ? Number(args.timestamp) : Date.now(),
    ...(args.modelUsed?.trim() ? { modelUsed: args.modelUsed.trim() } : {}),
  };
}

function fallbackHash(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export async function hashTranslationSource(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackHash(bytes);

  try {
    const digest = await subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    return `sha256:${hex}`;
  } catch {
    return fallbackHash(bytes);
  }
}


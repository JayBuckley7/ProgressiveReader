import type { TranslationCacheEntry } from "@core/translation/cachePort";

export function isTranslationCacheValid(
  entry: TranslationCacheEntry,
  current: { targetLanguage: string; cefrLevel: string }
): boolean {
  if (!entry?.content?.trim()) return false;
  const targetLanguage = (current.targetLanguage || "English").trim() || "English";
  const cefrLevel = (current.cefrLevel || "").trim();
  return entry.targetLanguage === targetLanguage && entry.cefrLevel === cefrLevel;
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


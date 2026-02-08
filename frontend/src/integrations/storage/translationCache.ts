import type { TranslationCacheEntry, TranslationCachePort } from "@core/translation/cachePort";

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

export function createTranslationCachePort(): TranslationCachePort {
  return {
    get(bookId: string, chapter: number): TranslationCacheEntry | null {
      try {
        if (typeof window === "undefined") return null;
        const raw = localStorage.getItem(keyFor(bookId, chapter));
        const parsed = safeJsonParse<any>(raw);
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
  };
}


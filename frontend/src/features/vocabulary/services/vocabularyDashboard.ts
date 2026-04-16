import type { JpdbLookupVocabularyEntry } from "@features/vocabulary/components/vocabularyPage/types";

const DUE_CACHE_VALID_MS = 15 * 60 * 1000;
const SELECTED_DECK_ID_KEY = "prVocabularySelectedJpdbDeckId";
const SELECTED_DECK_NAME_KEY = "prVocabularySelectedJpdbDeckName";

const dueCacheKey = (deckId: string) => `jpdb_due_cards_v2:${deckId}`;
const dueCacheTsKey = (deckId: string) => `jpdb_due_cards_v2_ts:${deckId}`;

export type SelectedJpdbDeck = {
  id: string;
  name: string;
};

export type CachedDueSummary = {
  deckId: string;
  count: number;
  checkedAt: string | null;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadSelectedJpdbDeck(): SelectedJpdbDeck | null {
  if (!canUseStorage()) return null;
  try {
    const id = localStorage.getItem(SELECTED_DECK_ID_KEY)?.trim() || "";
    if (!id) return null;
    const name = localStorage.getItem(SELECTED_DECK_NAME_KEY)?.trim() || id;
    return { id, name };
  } catch {
    return null;
  }
}

export function saveSelectedJpdbDeck(deck: SelectedJpdbDeck): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(SELECTED_DECK_ID_KEY, deck.id);
    localStorage.setItem(SELECTED_DECK_NAME_KEY, deck.name);
  } catch {
    // ignore storage errors
  }
}

export function clearSelectedJpdbDeck(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(SELECTED_DECK_ID_KEY);
    localStorage.removeItem(SELECTED_DECK_NAME_KEY);
  } catch {
    // ignore storage errors
  }
}

export function loadCachedDueEntries(deckId: string): JpdbLookupVocabularyEntry[] | null {
  if (!canUseStorage() || !deckId) return null;
  try {
    const timestamp = localStorage.getItem(dueCacheTsKey(deckId));
    if (!timestamp) return null;
    if (Date.now() - Number(timestamp) > DUE_CACHE_VALID_MS) {
      localStorage.removeItem(dueCacheKey(deckId));
      localStorage.removeItem(dueCacheTsKey(deckId));
      return null;
    }

    const payload = localStorage.getItem(dueCacheKey(deckId));
    return payload ? (JSON.parse(payload) as JpdbLookupVocabularyEntry[]) : null;
  } catch {
    return null;
  }
}

export function saveCachedDueEntries(deckId: string, entries: JpdbLookupVocabularyEntry[]): void {
  if (!canUseStorage() || !deckId) return;
  try {
    localStorage.setItem(dueCacheKey(deckId), JSON.stringify(entries));
    localStorage.setItem(dueCacheTsKey(deckId), Date.now().toString());
  } catch {
    // ignore storage errors
  }
}

export function getCachedDueSummary(deckId: string): CachedDueSummary | null {
  if (!canUseStorage() || !deckId) return null;
  const entries = loadCachedDueEntries(deckId);
  if (!entries) return null;

  try {
    const timestamp = localStorage.getItem(dueCacheTsKey(deckId));
    const checkedAtMs = Number(timestamp);
    return {
      deckId,
      count: entries.length,
      checkedAt: Number.isFinite(checkedAtMs) && checkedAtMs > 0 ? new Date(checkedAtMs).toISOString() : null,
    };
  } catch {
    return {
      deckId,
      count: entries.length,
      checkedAt: null,
    };
  }
}

import type { JpdbLookupVocabularyEntry } from "@features/vocabulary/components/vocabularyPage/types";

const DUE_CACHE_VALID_MS = 15 * 60 * 1000;
const SELECTED_DECK_ID_KEY = "prVocabularySelectedJpdbDeckId";
const SELECTED_DECK_NAME_KEY = "prVocabularySelectedJpdbDeckName";

const scoped = (key: string, owner?: string) => owner ? `${key}:owner:${encodeURIComponent(owner)}` : key;
const dueCacheKey = (deckId: string, owner?: string) => scoped(`jpdb_due_cards_v2:${deckId}`, owner);
const dueCacheTsKey = (deckId: string, owner?: string) => scoped(`jpdb_due_cards_v2_ts:${deckId}`, owner);

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

export function loadSelectedJpdbDeck(owner?: string): SelectedJpdbDeck | null {
  if (!canUseStorage()) return null;
  try {
    const id = localStorage.getItem(scoped(SELECTED_DECK_ID_KEY, owner))?.trim() || "";
    if (!id) return null;
    const name = localStorage.getItem(scoped(SELECTED_DECK_NAME_KEY, owner))?.trim() || id;
    return { id, name };
  } catch {
    return null;
  }
}

export function saveSelectedJpdbDeck(deck: SelectedJpdbDeck, owner?: string): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(scoped(SELECTED_DECK_ID_KEY, owner), deck.id);
    localStorage.setItem(scoped(SELECTED_DECK_NAME_KEY, owner), deck.name);
  } catch {
    // ignore storage errors
  }
}

export function clearSelectedJpdbDeck(owner?: string): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(scoped(SELECTED_DECK_ID_KEY, owner));
    localStorage.removeItem(scoped(SELECTED_DECK_NAME_KEY, owner));
  } catch {
    // ignore storage errors
  }
}

export function loadCachedDueEntries(deckId: string, owner?: string): JpdbLookupVocabularyEntry[] | null {
  if (!canUseStorage() || !deckId) return null;
  try {
    const timestamp = localStorage.getItem(dueCacheTsKey(deckId, owner));
    if (!timestamp) return null;
    if (Date.now() - Number(timestamp) > DUE_CACHE_VALID_MS) {
      localStorage.removeItem(dueCacheKey(deckId, owner));
      localStorage.removeItem(dueCacheTsKey(deckId, owner));
      return null;
    }

    const payload = localStorage.getItem(dueCacheKey(deckId, owner));
    return payload ? (JSON.parse(payload) as JpdbLookupVocabularyEntry[]) : null;
  } catch {
    return null;
  }
}

export function saveCachedDueEntries(deckId: string, entries: JpdbLookupVocabularyEntry[], owner?: string): void {
  if (!canUseStorage() || !deckId) return;
  try {
    localStorage.setItem(dueCacheKey(deckId, owner), JSON.stringify(entries));
    localStorage.setItem(dueCacheTsKey(deckId, owner), Date.now().toString());
  } catch {
    // ignore storage errors
  }
}

export function getCachedDueSummary(deckId: string, owner?: string): CachedDueSummary | null {
  if (!canUseStorage() || !deckId) return null;
  const entries = loadCachedDueEntries(deckId, owner);
  if (!entries) return null;

  try {
    const timestamp = localStorage.getItem(dueCacheTsKey(deckId, owner));
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

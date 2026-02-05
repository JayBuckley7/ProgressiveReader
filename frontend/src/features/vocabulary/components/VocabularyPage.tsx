import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useUser } from "@clerk/clerk-react";

import {
  addVocabularyWord,
  getUserVocabulary,
  listDeckVocabulary,
  lookupVocabulary,
  toggleMastered as toggleMasteredApi,
  type JpdbLookupVocabularyEntry,
  type JpdbVocabPair,
  type VocabularyWord as ApiVocabularyWord,
} from "@features/vocabulary/services/vocabApi";

import { DeckSelector } from "./DeckSelector";

type DueBucketKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

const MS_DAY = 24 * 60 * 60 * 1000;

function normalizeEpochMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  // seconds ≈ 1.7e9, milliseconds ≈ 1.7e12, microseconds ≈ 1.7e15
  if (value > 1e14) return Math.floor(value / 1000);
  if (value > 1e11) return Math.floor(value);
  return Math.floor(value * 1000);
}

function formatDueAt(value: unknown): string | null {
  const dueAtMs = normalizeEpochMs(value);
  if (dueAtMs === null) return null;
  return new Date(dueAtMs).toLocaleString();
}

function formatDueDate(value: unknown): string | null {
  const dueAtMs = normalizeEpochMs(value);
  if (dueAtMs === null) return null;
  return new Date(dueAtMs).toLocaleDateString();
}

function isDueEntry(entry: JpdbLookupVocabularyEntry, nowMs: number): boolean {
  const dueAt = normalizeEpochMs((entry as any).due_at);
  if (dueAt !== null) return dueAt <= nowMs;

  const state = (entry as any).card_state;
  if (typeof state === "string") return state.toLowerCase().includes("due");
  if (Array.isArray(state)) {
    return state.some((s) => typeof s === "string" && s.toLowerCase().includes("due"));
  }
  return false;
}

function groupDeckVocabularyByDueAt(entries: JpdbLookupVocabularyEntry[]) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDayAfterTomorrow = new Date(startOfTomorrow);
  startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);

  const startOfTodayMs = startOfToday.getTime();
  const startOfTomorrowMs = startOfTomorrow.getTime();
  const startOfDayAfterTomorrowMs = startOfDayAfterTomorrow.getTime();
  const weekWindowMs = startOfTodayMs + 7 * MS_DAY;

  const buckets: Record<DueBucketKey, JpdbLookupVocabularyEntry[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    week: [],
    later: [],
    none: [],
  };

  for (const entry of entries) {
    const dueAtMs = normalizeEpochMs((entry as any).due_at);
    if (dueAtMs === null) buckets.none.push(entry);
    else if (dueAtMs < startOfTodayMs) buckets.overdue.push(entry);
    else if (dueAtMs < startOfTomorrowMs) buckets.today.push(entry);
    else if (dueAtMs < startOfDayAfterTomorrowMs) buckets.tomorrow.push(entry);
    else if (dueAtMs < weekWindowMs) buckets.week.push(entry);
    else buckets.later.push(entry);
  }

  const byWord = (a: JpdbLookupVocabularyEntry, b: JpdbLookupVocabularyEntry) =>
    String(a.spelling || "").localeCompare(String(b.spelling || ""));

  const byDueThenWord = (a: JpdbLookupVocabularyEntry, b: JpdbLookupVocabularyEntry) => {
    const aDue = normalizeEpochMs((a as any).due_at) ?? Number.POSITIVE_INFINITY;
    const bDue = normalizeEpochMs((b as any).due_at) ?? Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return byWord(a, b);
  };

  buckets.overdue.sort(byDueThenWord);
  buckets.today.sort(byDueThenWord);
  buckets.tomorrow.sort(byDueThenWord);
  buckets.week.sort(byDueThenWord);
  buckets.later.sort(byDueThenWord);
  buckets.none.sort(byWord);

  const labels: Record<DueBucketKey, string> = {
    overdue: "Overdue",
    today: "Due today",
    tomorrow: "Due tomorrow",
    week: "Due this week",
    later: "Later",
    none: "No due date",
  };

  const order: DueBucketKey[] = ["overdue", "today", "tomorrow", "week", "later", "none"];
  const defaultOpen = new Set<DueBucketKey>(["overdue", "today"]);

  return order
    .map((key) => ({
      key,
      label: labels[key],
      defaultOpen: defaultOpen.has(key),
      entries: buckets[key],
    }))
    .filter((g) => g.entries.length > 0);
}

interface VocabularyWord {
  _id: string; // Was: Id<"vocabulary">
  word: string;
  translation: string;
  language: string;
  bookId?: string; // Was: Id<"books">
  context?: string;
  difficulty?: "easy" | "medium" | "hard";
  mastered: boolean;
  _creationTime: number;
}

export function VocabularyPage() {
  const { t } = useTranslation();
  const { isSignedIn } = useUser();

  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMastered, setFilterMastered] = useState<"all" | "mastered" | "learning">("all");

  const [vocabulary, setVocabulary] = useState<VocabularyWord[]>([]);
  const [isLoadingVocabulary, setIsLoadingVocabulary] = useState(false);
  const [vocabError, setVocabError] = useState<string | null>(null);

  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [selectedDeckName, setSelectedDeckName] = useState<string>("");

  const [deckVocabPairs, setDeckVocabPairs] = useState<JpdbVocabPair[]>([]);
  const [deckVocabEntries, setDeckVocabEntries] = useState<JpdbLookupVocabularyEntry[]>([]);
  const [deckVocabError, setDeckVocabError] = useState<string | null>(null);
  const [isLoadingDeckVocab, setIsLoadingDeckVocab] = useState(false);

  const [dueVocabEntries, setDueVocabEntries] = useState<JpdbLookupVocabularyEntry[]>([]);
  const [dueVocabError, setDueVocabError] = useState<string | null>(null);
  const [isLoadingDueVocab, setIsLoadingDueVocab] = useState(false);
  const [dueVocabProgress, setDueVocabProgress] = useState<{ phase: "scan" | "details"; loaded: number; total: number } | null>(null);

  const books: any[] = []; // TODO: Load books from backend if needed

  const DUE_CACHE_VALID_MS = 15 * 60 * 1000;
  const dueCacheKey = (deckId: string) => `jpdb_due_cards_v2:${deckId}`;
  const dueCacheTsKey = (deckId: string) => `jpdb_due_cards_v2_ts:${deckId}`;

  const loadCachedDue = (deckId: string): JpdbLookupVocabularyEntry[] | null => {
    if (!deckId) return null;
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
  };

  const saveCachedDue = (deckId: string, entries: JpdbLookupVocabularyEntry[]) => {
    if (!deckId) return;
    try {
      localStorage.setItem(dueCacheKey(deckId), JSON.stringify(entries));
      localStorage.setItem(dueCacheTsKey(deckId), Date.now().toString());
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    setDeckVocabPairs([]);
    setDeckVocabEntries([]);
    setDeckVocabError(null);

    setDueVocabEntries([]);
    setDueVocabError(null);

    if (selectedDeckId) {
      const cached = loadCachedDue(selectedDeckId);
      if (cached) setDueVocabEntries(cached);
    } else {
      setSelectedDeckName("");
    }
  }, [selectedDeckId]);

  const loadVocabulary = useCallback(async () => {
    setIsLoadingVocabulary(true);
    setVocabError(null);
    try {
      if (!isSignedIn) {
        setVocabulary([]);
        return;
      }

      const vocab = await getUserVocabulary({
        language: selectedLanguage || undefined,
        mastered: filterMastered === "all" ? undefined : filterMastered === "mastered",
      });

      const converted: VocabularyWord[] = vocab.map((v: ApiVocabularyWord) => ({
        _id: v.id,
        word: v.word,
        translation: v.translation,
        language: v.language,
        bookId: v.bookId || undefined,
        context: v.context || undefined,
        difficulty: v.difficulty as "easy" | "medium" | "hard" | undefined,
        mastered: v.mastered,
        _creationTime: v.createdAt ? new Date(v.createdAt).getTime() : Date.now(),
      }));
      setVocabulary(converted);
    } catch (error) {
      console.error("Failed to load vocabulary:", error);
      const message = error instanceof Error ? error.message : "Failed to load vocabulary";
      setVocabError(message);
      if (message.includes("401") || message.includes("Authentication")) {
        toast.error("Sign in required to load vocabulary.");
      }
    } finally {
      setIsLoadingVocabulary(false);
    }
  }, [filterMastered, isSignedIn, selectedLanguage]);

  useEffect(() => {
    void loadVocabulary();
  }, [loadVocabulary]);

  const handleToggleMastered = async (wordId: string) => {
    try {
      const word = vocabulary.find((w) => w._id === wordId);
      if (!word) return;

      const updatedWord = await toggleMasteredApi(wordId, !word.mastered);
      setVocabulary((prev) =>
        prev.map((w) => (w._id === wordId ? { ...w, mastered: updatedWord.mastered } : w))
      );
      toast.success(`Word marked as ${updatedWord.mastered ? "mastered" : "learning"}`);
    } catch (error) {
      toast.error("Failed to update word status");
      console.error(error);
    }
  };

  const stats = {
    total: vocabulary.length,
    mastered: vocabulary.filter((w) => w.mastered).length,
    learning: vocabulary.filter((w) => !w.mastered).length,
  };

  const languages = Array.from(new Set(vocabulary.map((word) => word.language)));

  const filteredVocabulary = vocabulary.filter((word) => {
    const needle = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      word.word.toLowerCase().includes(needle) ||
      word.translation.toLowerCase().includes(needle);

    const matchesMastered =
      filterMastered === "all" ||
      (filterMastered === "mastered" && word.mastered) ||
      (filterMastered === "learning" && !word.mastered);

    const matchesLanguage = !selectedLanguage || word.language === selectedLanguage;

    return matchesSearch && matchesMastered && matchesLanguage;
  });

  const LOOKUP_BATCH_SIZE = 200;
  const DECK_LOOKUP_FIELDS = ["spelling", "reading", "frequency_rank", "meanings", "card_state", "due_at"];

  const openSelectedDeck = async () => {
    if (!selectedDeckId) {
      toast.error("Select a deck first");
      return;
    }
    if (!isSignedIn) {
      toast.error("Sign in required");
      return;
    }

    setIsLoadingDeckVocab(true);
    setDeckVocabError(null);
    try {
      const pairs = await listDeckVocabulary(selectedDeckId);
      setDeckVocabPairs(pairs);
      setDeckVocabEntries([]);

      if (pairs.length === 0) {
        toast.info("Deck is empty");
        return;
      }

      const firstChunk = pairs.slice(0, LOOKUP_BATCH_SIZE);
      const entries = await lookupVocabulary(firstChunk, DECK_LOOKUP_FIELDS);
      setDeckVocabEntries(entries);
    } catch (err: any) {
      const message = String(err?.message || "Failed to open deck");
      setDeckVocabError(message);
      if (message.includes("JPDB API key not configured")) {
        toast.error("JPDB API key not configured. Add it in Settings → Highlight.");
      } else {
        toast.error("Failed to open deck");
      }
    } finally {
      setIsLoadingDeckVocab(false);
    }
  };

  const loadMoreDeckVocabulary = async () => {
    if (!deckVocabPairs.length) return;
    if (isLoadingDeckVocab) return;

    const start = deckVocabEntries.length;
    const chunk = deckVocabPairs.slice(start, start + LOOKUP_BATCH_SIZE);
    if (chunk.length === 0) return;

    setIsLoadingDeckVocab(true);
    setDeckVocabError(null);
    try {
      const entries = await lookupVocabulary(chunk, DECK_LOOKUP_FIELDS);
      setDeckVocabEntries((prev) => [...prev, ...entries]);
    } catch (err: any) {
      const message = String(err?.message || "Failed to load vocabulary");
      setDeckVocabError(message);
      toast.error("Failed to load deck vocabulary");
    } finally {
      setIsLoadingDeckVocab(false);
    }
  };

  const filteredDeckVocabulary = deckVocabEntries.filter((entry) => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return true;
    const spelling = String(entry.spelling || "").toLowerCase();
    const reading = String(entry.reading || "").toLowerCase();
    const meanings = Array.isArray(entry.meanings) ? entry.meanings.join(" ").toLowerCase() : "";
    return spelling.includes(needle) || reading.includes(needle) || meanings.includes(needle);
  });

  const groupedDeckVocabulary = useMemo(
    () => groupDeckVocabularyByDueAt(filteredDeckVocabulary),
    [filteredDeckVocabulary]
  );

  const DUE_SCAN_FIELDS = ["due_at", "card_state"];
  const DUE_DETAIL_FIELDS = ["spelling", "reading", "meanings", "card_state", "due_at"];
  const DUE_BATCH_SIZE = 400;

  const handleRefreshDueCards = async () => {
    if (!isSignedIn) {
      toast.error("Sign in to fetch due cards.");
      return;
    }
    if (!selectedDeckId) {
      toast.error("Select a deck first.");
      return;
    }
    if (isLoadingDueVocab) return;

    setIsLoadingDueVocab(true);
    setDueVocabError(null);
    setDueVocabProgress(null);

    try {
      const pairs = deckVocabPairs.length ? deckVocabPairs : await listDeckVocabulary(selectedDeckId);
      if (!deckVocabPairs.length) setDeckVocabPairs(pairs);

      if (pairs.length === 0) {
        setDueVocabEntries([]);
        saveCachedDue(selectedDeckId, []);
        toast.info("Deck is empty");
        return;
      }

      const nowMs = Date.now();
      const duePairs: JpdbVocabPair[] = [];

      setDueVocabProgress({ phase: "scan", loaded: 0, total: pairs.length });
      for (let i = 0; i < pairs.length; i += DUE_BATCH_SIZE) {
        const chunk = pairs.slice(i, i + DUE_BATCH_SIZE);
        const scan = await lookupVocabulary(chunk, DUE_SCAN_FIELDS);
        scan.forEach((entry) => {
          if (isDueEntry(entry, nowMs)) duePairs.push([entry.vid, entry.sid]);
        });
        setDueVocabProgress({
          phase: "scan",
          loaded: Math.min(i + DUE_BATCH_SIZE, pairs.length),
          total: pairs.length,
        });
      }

      if (duePairs.length === 0) {
        setDueVocabEntries([]);
        saveCachedDue(selectedDeckId, []);
        toast.success("No due cards found");
        return;
      }

      const dueEntries: JpdbLookupVocabularyEntry[] = [];
      setDueVocabProgress({ phase: "details", loaded: 0, total: duePairs.length });
      for (let i = 0; i < duePairs.length; i += DUE_BATCH_SIZE) {
        const chunk = duePairs.slice(i, i + DUE_BATCH_SIZE);
        const detail = await lookupVocabulary(chunk, DUE_DETAIL_FIELDS);
        dueEntries.push(...detail);
        setDueVocabProgress({
          phase: "details",
          loaded: Math.min(i + DUE_BATCH_SIZE, duePairs.length),
          total: duePairs.length,
        });
      }

      dueEntries.sort((a, b) => {
        const aMs = normalizeEpochMs((a as any).due_at) ?? Number.POSITIVE_INFINITY;
        const bMs = normalizeEpochMs((b as any).due_at) ?? Number.POSITIVE_INFINITY;
        return aMs - bMs;
      });

      setDueVocabEntries(dueEntries);
      saveCachedDue(selectedDeckId, dueEntries);
      toast.success(`Found ${dueEntries.length} due cards`);
    } catch (err: any) {
      const message = String(err?.message || "Failed to fetch due cards");
      console.error("Failed to fetch due cards", err);
      setDueVocabError(message);
      if (message.includes("JPDB API key not configured")) {
        toast.error("JPDB API key not configured. Add it in Settings → Highlight.");
      } else {
        toast.error("Failed to fetch due cards");
      }
    } finally {
      setIsLoadingDueVocab(false);
      setDueVocabProgress(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 dark:text-gray-200">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t("vocabulary.header.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400">{t("vocabulary.header.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-gray-600 dark:text-gray-400">{t("vocabulary.stats.total")}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
          <div className="text-3xl font-bold text-green-600">{stats.mastered}</div>
          <div className="text-gray-600 dark:text-gray-400">{t("vocabulary.stats.mastered")}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
          <div className="text-3xl font-bold text-orange-600">{stats.learning}</div>
          <div className="text-gray-600 dark:text-gray-400">{t("vocabulary.stats.learning")}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">{t("vocabulary.dueCards.title")}</h2>
          {selectedDeckName ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">Deck: {selectedDeckName}</div>
          ) : null}
        </div>

        {dueVocabError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {dueVocabError}
          </div>
        )}

        {dueVocabEntries.length > 0 ? (
          <>
            <ul className="grid gap-2 mb-4">
              {dueVocabEntries.slice(0, 12).map((entry) => {
                const dueLabel = formatDueAt((entry as any).due_at);
                return (
                  <li key={`${entry.vid}:${entry.sid}`} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {String(entry.spelling || "")}
                        {entry.reading ? (
                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">{String(entry.reading)}</span>
                        ) : null}
                      </div>
                      {Array.isArray(entry.meanings) && entry.meanings.length > 0 ? (
                        <div className="text-sm text-gray-600 dark:text-gray-300 truncate">{String(entry.meanings[0])}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400 text-right">
                      {dueLabel ? `Due: ${dueLabel}` : "Due"}
                    </div>
                  </li>
                );
              })}
            </ul>
            {dueVocabEntries.length > 12 && (
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                + {dueVocabEntries.length - 12} more
              </div>
            )}
          </>
        ) : (
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {selectedDeckId ? t("vocabulary.dueCards.none") : "Select a deck below to compute due cards."}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleRefreshDueCards}
            disabled={!isSignedIn || !selectedDeckId || isLoadingDueVocab}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingDueVocab ? "Refreshing…" : t("vocabulary.dueCards.fetch")}
          </button>
          {dueVocabProgress && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {dueVocabProgress.phase === "scan" ? "Scanning" : "Loading"} {dueVocabProgress.loaded}/{dueVocabProgress.total}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">{t("vocabulary.decks.title")}</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{t("vocabulary.decks.description")}</p>

        {isSignedIn ? (
          <DeckSelector
            selectedDeckId={selectedDeckId}
            onDeckSelect={(deck) => {
              setSelectedDeckId(deck.id);
              setSelectedDeckName(deck.name);
            }}
          />
        ) : (
          <div className="text-sm app-muted">Sign in to load JPDB decks.</div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={openSelectedDeck}
            disabled={!isSignedIn || !selectedDeckId || isLoadingDeckVocab}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Open deck
          </button>
          <button
            onClick={loadMoreDeckVocabulary}
            disabled={!deckVocabPairs.length || deckVocabEntries.length >= deckVocabPairs.length || isLoadingDeckVocab}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Load more
          </button>
          {deckVocabPairs.length > 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Loaded {deckVocabEntries.length}/{deckVocabPairs.length}
            </div>
          )}
          {isLoadingDeckVocab && <div className="text-sm text-gray-600 dark:text-gray-400">Loading…</div>}
        </div>

        {deckVocabError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
            {deckVocabError}
          </div>
        )}

        {deckVocabEntries.length > 0 && (
          <div className="mt-5 space-y-3">
            {groupedDeckVocabulary.map((group) => (
              <details
                key={group.key}
                open={group.defaultOpen}
                className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700"
              >
                <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-4">
                  <div className="font-semibold text-gray-900 dark:text-white">{group.label}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{group.entries.length}</div>
                </summary>
                <div className="px-4 pb-4 grid gap-3">
                  {group.entries.map((entry) => {
                    const dueDate = formatDueDate((entry as any).due_at);
                    return (
                      <div
                        key={`${entry.vid}:${entry.sid}`}
                        className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-3">
                              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                {String(entry.spelling || "")}
                              </div>
                              {entry.reading ? (
                                <div className="text-sm text-gray-600 dark:text-gray-300">
                                  {String(entry.reading)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            {dueDate ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400">Due {dueDate}</div>
                            ) : null}
                            {typeof entry.frequency_rank === "number" ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400">#{entry.frequency_rank}</div>
                            ) : null}
                          </div>
                        </div>
                        {Array.isArray(entry.meanings) && entry.meanings.length > 0 ? (
                          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                            {entry.meanings.slice(0, 2).join("; ")}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <input
              type="text"
              placeholder={t("vocabulary.controls.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
            />

            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
            >
              <option value="">{t("vocabulary.controls.allLanguages")}</option>
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>

            <select
              value={filterMastered}
              onChange={(e) => setFilterMastered(e.target.value as "all" | "mastered" | "learning")}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
            >
              <option value="all">{t("vocabulary.controls.filterAll")}</option>
              <option value="learning">{t("vocabulary.controls.filterLearning")}</option>
              <option value="mastered">{t("vocabulary.controls.filterMastered")}</option>
            </select>
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            disabled={!isSignedIn}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("vocabulary.controls.addWord")}
          </button>
        </div>
      </div>

      {!isSignedIn && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          Sign in to view and manage vocabulary. JPDB features also require your JPDB API key (Settings → Highlight).
        </div>
      )}

      {vocabError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {vocabError}
        </div>
      )}

      {isLoadingVocabulary ? (
        <div className="flex justify-center py-12">
          <div className="app-muted animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
        </div>
      ) : filteredVocabulary.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {vocabulary.length === 0 ? t("vocabulary.empty.noneYet") : t("vocabulary.empty.noneFound")}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {vocabulary.length === 0 ? t("vocabulary.empty.promptAdd") : t("vocabulary.empty.noneFound")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredVocabulary.map((word) => (
            <VocabularyCard key={word._id} word={word} books={books} onToggleMastered={handleToggleMastered} />
          ))}
        </div>
      )}

      {showAddForm && (
        <AddWordModal
          onClose={() => setShowAddForm(false)}
          onAdded={async () => {
            await loadVocabulary();
            setShowAddForm(false);
          }}
          books={books}
        />
      )}
    </div>
  );
}

interface VocabularyCardProps {
  word: VocabularyWord;
  books: any[];
  onToggleMastered: (wordId: string) => void;
}

function VocabularyCard({ word, books, onToggleMastered }: VocabularyCardProps) {
  const book = word.bookId ? books.find((b) => b._id === word.bookId) : null;
  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case "easy":
        return "bg-green-100 text-green-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "hard":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{word.word}</h3>
            <span className="text-lg text-gray-600 dark:text-gray-300">→ {word.translation}</span>
            {word.difficulty && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(word.difficulty)}`}>
                {word.difficulty}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {word.language}
            </span>
            {book && <span>📖 {book.title}</span>}
            <span>{new Date(word._creationTime).toLocaleDateString()}</span>
          </div>
          {word.context && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{word.context}"</p>
            </div>
          )}
        </div>
        <button
          onClick={() => onToggleMastered(word._id)}
          className={`ml-4 px-4 py-2 rounded-lg font-medium transition-colors ${
            word.mastered
              ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          {word.mastered ? "✓ Mastered" : "Learning"}
        </button>
      </div>
    </div>
  );
}

interface AddWordModalProps {
  onClose: () => void;
  onAdded: () => void | Promise<void>;
  books: any[];
}

function AddWordModal({ onClose, onAdded, books }: AddWordModalProps) {
  const { t } = useTranslation();
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [language, setLanguage] = useState("English");
  const [bookId, setBookId] = useState("");
  const [context, setContext] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !translation.trim()) {
      toast.error("Word and translation are required");
      return;
    }
    setIsSubmitting(true);
    try {
      await addVocabularyWord({
        word: word.trim(),
        translation: translation.trim(),
        language,
        bookId: bookId || undefined,
        context: context.trim() || undefined,
        difficulty: difficulty || undefined,
      });
      toast.success("Word added successfully!");
      await onAdded();
    } catch (error) {
      toast.error("Failed to add word");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full max-height-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("vocabulary.addModal.title")}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              ✕
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.word")}
              </label>
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
                placeholder={t("vocabulary.addModal.placeholders.word")}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.translation")}
              </label>
              <input
                type="text"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
                placeholder={t("vocabulary.addModal.placeholders.translation")}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.language")}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="Chinese">Chinese</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.book")}
              </label>
              <select
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
              >
                <option value="">{t("vocabulary.addModal.placeholders.selectBook")}</option>
                {books.map((book) => (
                  <option key={book._id} value={book._id}>
                    {book.title} - {book.author}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.difficulty")}
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard" | "")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
              >
                <option value="">{t("vocabulary.addModal.placeholders.selectDifficulty")}</option>
                <option value="easy">{t("vocabulary.addModal.difficultyOptions.easy")}</option>
                <option value="medium">{t("vocabulary.addModal.difficultyOptions.medium")}</option>
                <option value="hard">{t("vocabulary.addModal.difficultyOptions.hard")}</option>
              </select>
            </div>
            <div>
              <label className="block text.sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.context")}
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none dark:bg-gray-700 dark:text-white"
                placeholder={t("vocabulary.addModal.placeholders.context")}
              />
            </div>
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {t("vocabulary.addModal.buttons.cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? t("vocabulary.addModal.buttons.submitting") : t("vocabulary.addModal.buttons.submit")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default VocabularyPage;

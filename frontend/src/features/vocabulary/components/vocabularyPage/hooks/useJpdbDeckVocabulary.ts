import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { useAppDeps } from "@app/deps/AppDepsProvider";

import { groupDeckVocabularyByDueAt, isDueEntry, normalizeEpochMs } from "../due";
import type { DeckVocabCache, DueVocabProgress, JpdbLookupVocabularyEntry, JpdbVocabPair } from "../types";

const LOOKUP_BATCH_SIZE = 200;
const DECK_LOOKUP_FIELDS = ["spelling", "reading", "frequency_rank", "meanings", "card_state", "due_at"];

const DUE_CACHE_VALID_MS = 15 * 60 * 1000;
const dueCacheKey = (deckId: string) => `jpdb_due_cards_v2:${deckId}`;
const dueCacheTsKey = (deckId: string) => `jpdb_due_cards_v2_ts:${deckId}`;

const DUE_SCAN_FIELDS = ["due_at", "card_state"];
const DUE_DETAIL_FIELDS = ["spelling", "reading", "meanings", "card_state", "due_at"];
const DUE_BATCH_SIZE = 400;

function loadCachedDue(deckId: string): JpdbLookupVocabularyEntry[] | null {
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
}

function saveCachedDue(deckId: string, entries: JpdbLookupVocabularyEntry[]) {
  if (!deckId) return;
  try {
    localStorage.setItem(dueCacheKey(deckId), JSON.stringify(entries));
    localStorage.setItem(dueCacheTsKey(deckId), Date.now().toString());
  } catch {
    // ignore storage errors
  }
}

export function useJpdbDeckVocabulary(params: { isSignedIn: boolean; searchTerm: string }) {
  const { isSignedIn, searchTerm } = params;
  const deps = useAppDeps();

  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [selectedDeckName, setSelectedDeckName] = useState<string>("");

  const [deckVocabById, setDeckVocabById] = useState<Record<string, DeckVocabCache>>({});
  const [deckVocabError, setDeckVocabError] = useState<string | null>(null);
  const [isLoadingDeckVocab, setIsLoadingDeckVocab] = useState(false);

  const [dueVocabEntries, setDueVocabEntries] = useState<JpdbLookupVocabularyEntry[]>([]);
  const [dueVocabError, setDueVocabError] = useState<string | null>(null);
  const [isLoadingDueVocab, setIsLoadingDueVocab] = useState(false);
  const [dueVocabProgress, setDueVocabProgress] = useState<DueVocabProgress | null>(null);

  useEffect(() => {
    setDeckVocabError(null);

    setDueVocabEntries([]);
    setDueVocabError(null);
    setDueVocabProgress(null);

    if (selectedDeckId) {
      const cached = loadCachedDue(selectedDeckId);
      if (cached) setDueVocabEntries(cached);
    } else {
      setSelectedDeckName("");
    }
  }, [selectedDeckId]);

  const currentDeckVocab = selectedDeckId ? deckVocabById[selectedDeckId] : undefined;
  const deckVocabPairs = currentDeckVocab?.pairs ?? [];
  const deckVocabEntries = currentDeckVocab?.entries ?? [];

  const selectDeck = useCallback((deck: { id: string; name: string }) => {
    setSelectedDeckId(deck.id);
    setSelectedDeckName(deck.name);
  }, []);

  const openSelectedDeck = useCallback(async () => {
    if (!selectedDeckId) {
      notifyError("Select a deck first");
      return;
    }
    if (!isSignedIn) {
      notifyError("Sign in required");
      return;
    }
    if (deckVocabPairs.length > 0) {
      toast.info("Deck already loaded. Use “Load more” to continue.");
      return;
    }

    setIsLoadingDeckVocab(true);
    setDeckVocabError(null);
    try {
      const pairs = await deps.backend.vocabulary.listDeckVocabulary(selectedDeckId);
      setDeckVocabById((prev) => ({
        ...prev,
        [selectedDeckId]: {
          deckName: selectedDeckName || prev[selectedDeckId]?.deckName || "",
          pairs,
          entries: [],
        },
      }));

      if (pairs.length === 0) {
        toast.info("Deck is empty");
        return;
      }

      const firstChunk = pairs.slice(0, LOOKUP_BATCH_SIZE);
      const entries = await deps.backend.vocabulary.lookupVocabulary(firstChunk, DECK_LOOKUP_FIELDS);
      setDeckVocabById((prev) => ({
        ...prev,
        [selectedDeckId]: {
          deckName: selectedDeckName || prev[selectedDeckId]?.deckName || "",
          pairs,
          entries,
        },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to open deck";
      setDeckVocabError(message);
      if (message.includes("JPDB API key not configured")) {
        notifyError(err, { title: "JPDB API key not configured. Add it in Settings → Highlight." });
      } else {
        notifyError(err, { title: "Failed to open deck" });
      }
    } finally {
      setIsLoadingDeckVocab(false);
    }
  }, [deckVocabPairs.length, isSignedIn, selectedDeckId, selectedDeckName]);

  const loadMoreDeckVocabulary = useCallback(async () => {
    if (!deckVocabPairs.length) return;
    if (isLoadingDeckVocab) return;

    const deckId = selectedDeckId;
    if (!deckId) return;

    const start = deckVocabEntries.length;
    const chunk = deckVocabPairs.slice(start, start + LOOKUP_BATCH_SIZE);
    if (chunk.length === 0) return;

    setIsLoadingDeckVocab(true);
    setDeckVocabError(null);
    try {
      const entries = await deps.backend.vocabulary.lookupVocabulary(chunk, DECK_LOOKUP_FIELDS);
      setDeckVocabById((prev) => {
        const existing = prev[deckId];
        if (!existing) return prev;
        return {
          ...prev,
          [deckId]: {
            ...existing,
            entries: [...existing.entries, ...entries],
          },
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load vocabulary";
      setDeckVocabError(message);
      notifyError(err, { title: "Failed to load deck vocabulary" });
    } finally {
      setIsLoadingDeckVocab(false);
    }
  }, [deckVocabEntries.length, deckVocabPairs, isLoadingDeckVocab, selectedDeckId]);

  const filteredDeckVocabulary = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return deckVocabEntries;
    return deckVocabEntries.filter((entry) => {
      const spelling = String(entry.spelling || "").toLowerCase();
      const reading = String(entry.reading || "").toLowerCase();
      const meanings = Array.isArray(entry.meanings) ? entry.meanings.join(" ").toLowerCase() : "";
      return spelling.includes(needle) || reading.includes(needle) || meanings.includes(needle);
    });
  }, [deckVocabEntries, searchTerm]);

  const groupedDeckVocabulary = useMemo(
    () => groupDeckVocabularyByDueAt(filteredDeckVocabulary),
    [filteredDeckVocabulary]
  );

  const refreshDueCards = useCallback(async () => {
    if (!isSignedIn) {
      notifyError("Sign in to fetch due cards.");
      return;
    }
    if (!selectedDeckId) {
      notifyError("Select a deck first.");
      return;
    }
    if (isLoadingDueVocab) return;

    setIsLoadingDueVocab(true);
    setDueVocabError(null);
    setDueVocabProgress(null);

    try {
      const deckId = selectedDeckId;
      const pairs =
        deckVocabPairs.length > 0 ? deckVocabPairs : await deps.backend.vocabulary.listDeckVocabulary(deckId);
      if (deckVocabPairs.length === 0) {
        setDeckVocabById((prev) => ({
          ...prev,
          [deckId]: {
            deckName: selectedDeckName || prev[deckId]?.deckName || "",
            pairs,
            entries: prev[deckId]?.entries ?? [],
          },
        }));
      }

      if (pairs.length === 0) {
        setDueVocabEntries([]);
        saveCachedDue(deckId, []);
        toast.info("Deck is empty");
        return;
      }

      const nowMs = Date.now();
      const duePairs: JpdbVocabPair[] = [];

      setDueVocabProgress({ phase: "scan", loaded: 0, total: pairs.length });
      for (let i = 0; i < pairs.length; i += DUE_BATCH_SIZE) {
        const chunk = pairs.slice(i, i + DUE_BATCH_SIZE);
        const scan = await deps.backend.vocabulary.lookupVocabulary(chunk, DUE_SCAN_FIELDS);
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
        const detail = await deps.backend.vocabulary.lookupVocabulary(chunk, DUE_DETAIL_FIELDS);
        dueEntries.push(...detail);
        setDueVocabProgress({
          phase: "details",
          loaded: Math.min(i + DUE_BATCH_SIZE, duePairs.length),
          total: duePairs.length,
        });
      }

      dueEntries.sort((a, b) => {
        const aMs = normalizeEpochMs(a.due_at) ?? Number.POSITIVE_INFINITY;
        const bMs = normalizeEpochMs(b.due_at) ?? Number.POSITIVE_INFINITY;
        return aMs - bMs;
      });

      setDueVocabEntries(dueEntries);
      saveCachedDue(selectedDeckId, dueEntries);
      toast.success(`Found ${dueEntries.length} due cards`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch due cards";
      appLog.error("[VocabularyPage] Failed to fetch due cards", err);
      setDueVocabError(message);
      if (message.includes("JPDB API key not configured")) {
        notifyError(err, { title: "JPDB API key not configured. Add it in Settings → Highlight." });
      } else {
        notifyError(err, { title: "Failed to fetch due cards" });
      }
    } finally {
      setIsLoadingDueVocab(false);
      setDueVocabProgress(null);
    }
  }, [
    deps.backend.vocabulary,
    deckVocabPairs,
    isLoadingDueVocab,
    isSignedIn,
    selectedDeckId,
    selectedDeckName,
  ]);

  return {
    selectedDeckId,
    selectedDeckName,
    selectDeck,
    deckVocabPairs,
    deckVocabEntries,
    deckVocabError,
    isLoadingDeckVocab,
    openSelectedDeck,
    loadMoreDeckVocabulary,
    groupedDeckVocabulary,
    dueVocabEntries,
    dueVocabError,
    isLoadingDueVocab,
    dueVocabProgress,
    refreshDueCards,
  };
}

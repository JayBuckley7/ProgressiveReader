import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { useAppDeps } from "@app/deps/AppDepsProvider";
import type { Vocabulary as ApiVocabularyWord } from "~/types/api";

import type { FilterMastered, VocabularyStats, VocabularyWord } from "../types";

export function useUserVocabulary(params: {
  isSignedIn: boolean;
  userId?: string;
  selectedLanguage: string;
  filterMastered: FilterMastered;
  searchTerm: string;
}) {
  const { isSignedIn, selectedLanguage, filterMastered, searchTerm } = params;
  const deps = useAppDeps();
  const requestVersion = useRef(0);

  const [vocabulary, setVocabulary] = useState<VocabularyWord[]>([]);
  const [isLoadingVocabulary, setIsLoadingVocabulary] = useState(false);
  const [vocabError, setVocabError] = useState<string | null>(null);

  const loadVocabulary = useCallback(async () => {
    const version = ++requestVersion.current;
    const owner = deps.auth.getUserId?.();
    setIsLoadingVocabulary(true);
    setVocabError(null);
    try {
      const vocab = await deps.backend.vocabulary.getUserVocabulary({});
      if (version !== requestVersion.current || owner !== deps.auth.getUserId?.()) return;

      const converted: VocabularyWord[] = vocab.map((v: ApiVocabularyWord) => ({
        _id: v.id,
        word: v.word,
        translation: v.translation,
        language: v.language,
        bookId: v.bookId || undefined,
        context: v.context || undefined,
        difficulty: (v.difficulty as "easy" | "medium" | "hard" | undefined) || undefined,
        mastered: Boolean(v.mastered),
        _creationTime: v.createdAt ? new Date(v.createdAt).getTime() : Date.now(),
      }));
      setVocabulary(converted);
    } catch (error) {
      if (version !== requestVersion.current || owner !== deps.auth.getUserId?.()) return;
      appLog.error("[VocabularyPage] Failed to load vocabulary", error);
      const message = error instanceof Error ? error.message : "Failed to load vocabulary";
      setVocabError(message);
      if (message.includes("401") || message.includes("Authentication")) {
        notifyError("Sign in required to load vocabulary.");
      }
    } finally {
      if (version === requestVersion.current) setIsLoadingVocabulary(false);
    }
  }, [deps.backend.vocabulary, deps.auth, isSignedIn, params.userId]);

  useEffect(() => {
    setVocabulary([]);
    void loadVocabulary();
    const reload = () => { void loadVocabulary(); };
    window.addEventListener("pr:saved-records-reload", reload);
    return () => { requestVersion.current++; window.removeEventListener("pr:saved-records-reload", reload); };
  }, [loadVocabulary]);

  const handleToggleMastered = useCallback(
    async (wordId: string) => {
      try {
        const word = vocabulary.find((w) => w._id === wordId);
        if (!word) return;

        const updatedWord = await deps.backend.vocabulary.toggleMastered(wordId, !word.mastered);
        setVocabulary((prev) =>
          prev.map((w) => (w._id === wordId ? { ...w, mastered: updatedWord.mastered } : w))
        );
        toast.success((updatedWord as { _localOnly?: boolean })._localOnly ? "Updated on this device; cloud sync pending." : `Word marked as ${updatedWord.mastered ? "mastered" : "learning"}`);
      } catch (error) {
        appLog.error("[VocabularyPage] Failed to update word status", error);
        notifyError(error, { title: "Failed to update word status" });
      }
    },
    [deps.backend.vocabulary, vocabulary]
  );

  const stats: VocabularyStats = useMemo(
    () => ({
      total: vocabulary.length,
      mastered: vocabulary.filter((w) => w.mastered).length,
      learning: vocabulary.filter((w) => !w.mastered).length,
    }),
    [vocabulary]
  );

  const languages = useMemo(() => Array.from(new Set(vocabulary.map((word) => word.language))), [vocabulary]);

  const filteredVocabulary = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return vocabulary.filter((word) => {
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
  }, [filterMastered, searchTerm, selectedLanguage, vocabulary]);

  return {
    vocabulary,
    filteredVocabulary,
    stats,
    languages,
    isLoadingVocabulary,
    vocabError,
    loadVocabulary,
    handleToggleMastered,
  };
}

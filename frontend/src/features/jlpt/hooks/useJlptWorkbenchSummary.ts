import { useMemo } from "react";

import { useGrammar } from "@features/grammar/contexts/GrammarContext";
import { GRAMMAR_CATALOG, GRAMMAR_LEVELS } from "@features/grammar/data/grammarCatalog";
import type { GrammarLevel } from "@features/grammar/data/grammarCatalog";
import type { GrammarScanStatus } from "@features/grammar/types";
import { getLevelReadinessSummary, getTodayGrammarProgress, getTodaySnapshotProgress } from "@features/jlpt/services/jlptSelectors";
import type { ActiveJlptGoal, LevelReadinessState } from "@features/jlpt/types";
import { getCachedDueSummary, loadSelectedJpdbDeck } from "@features/vocabulary/services/vocabularyDashboard";

function toGrammarLevel(level: ActiveJlptGoal["level"] | null): GrammarLevel | null {
  if (!level) return null;
  return level.toLowerCase() as GrammarLevel;
}

function countStatuses(statuses: Array<GrammarScanStatus | undefined>) {
  return statuses.reduce<Record<GrammarScanStatus, number>>(
    (acc, status) => {
      if (!status) return acc;
      acc[status] += 1;
      return acc;
    },
    {
      idle: 0,
      queued: 0,
      scanning: 0,
      complete: 0,
      not_found_yet: 0,
      error: 0,
    }
  );
}

export type JlptVocabularyWorkbenchSummary = {
  levelLabel: string | null;
  linkedDeckCount: number;
  percent: number;
  known: number;
  total: number;
  remaining: number;
  todayKnownGain: number;
  lastCheckedAt?: string;
  selectedDeckName: string | null;
  cachedDueCount: number | null;
  cachedDueCheckedAt: string | null;
};

export type JlptGrammarWorkbenchSummary = {
  levelLabel: string | null;
  knownCount: number;
  totalCount: number;
  remainingCount: number;
  percent: number;
  todayKnownGain: number;
  learningCount: number;
  exampleBackedCount: number;
  queuedCount: number;
  scanningCount: number;
  errorCount: number;
  miningEnabled: boolean;
  activeMiningLabel: string | null;
  lastTrackedAt?: string;
};

export function useJlptWorkbenchSummary(params: {
  activeGoal: ActiveJlptGoal | null;
  activeLevelState: LevelReadinessState | null;
}) {
  const { activeGoal, activeLevelState } = params;
  const grammar = useGrammar();

  return useMemo(() => {
    const selectedDeck = loadSelectedJpdbDeck();
    const cachedDue = selectedDeck ? getCachedDueSummary(selectedDeck.id) : null;
    const readiness = activeLevelState ? getLevelReadinessSummary(activeLevelState, { enabledOnly: true }) : null;
    const grammarLevel = toGrammarLevel(activeGoal?.level || null);

    const knownIds = grammar.state.knownIds.filter((grammarId) => {
      if (!grammarLevel) return true;
      const point = grammar.getGrammarPoint(grammarId);
      return point?.level === grammarLevel;
    });
    const learningIds = grammar.state.learningIds.filter((grammarId) => {
      if (!grammarLevel) return true;
      const point = grammar.getGrammarPoint(grammarId);
      return point?.level === grammarLevel;
    });
    const totalCount = grammarLevel
      ? GRAMMAR_CATALOG[grammarLevel].length
      : GRAMMAR_LEVELS.reduce((sum, level) => sum + GRAMMAR_CATALOG[level].length, 0);
    const remainingCount = Math.max(0, totalCount - knownIds.length);
    const percent = totalCount > 0 ? Math.round((knownIds.length / totalCount) * 100) : 0;
    const exampleBackedCount = learningIds.filter((grammarId) => grammar.getExamples(grammarId).length > 0).length;
    const statusCounts = countStatuses(
      learningIds.map((grammarId) => grammar.getScanState(grammarId)?.status)
    );

    return {
      vocabulary: {
        levelLabel: activeGoal?.level || null,
        linkedDeckCount: activeLevelState?.bindings.filter((binding) => binding.enabled).length || 0,
        percent: readiness?.percent || 0,
        known: readiness?.known || 0,
        total: readiness?.total || 0,
        remaining: readiness?.remaining || 0,
        todayKnownGain: activeLevelState ? getTodaySnapshotProgress(activeLevelState) : 0,
        lastCheckedAt: activeLevelState?.lastCheckedAt,
        selectedDeckName: selectedDeck?.name || null,
        cachedDueCount: cachedDue?.count ?? null,
        cachedDueCheckedAt: cachedDue?.checkedAt ?? null,
      } satisfies JlptVocabularyWorkbenchSummary,
      grammar: {
        levelLabel: activeGoal?.level || null,
        knownCount: knownIds.length,
        totalCount,
        remainingCount,
        percent,
        todayKnownGain: activeLevelState ? getTodayGrammarProgress(activeLevelState, knownIds.length) : 0,
        learningCount: learningIds.length,
        exampleBackedCount,
        queuedCount: statusCounts.queued,
        scanningCount: statusCounts.scanning,
        errorCount: statusCounts.error,
        miningEnabled: grammar.miningEnabled,
        activeMiningLabel: grammar.activeMiningGrammarId ? grammar.getGrammarPoint(grammar.activeMiningGrammarId)?.title || grammar.activeMiningGrammarId : null,
        lastTrackedAt: activeLevelState?.lastGrammarCheckedAt,
      } satisfies JlptGrammarWorkbenchSummary,
    };
  }, [
    activeGoal?.level,
    activeLevelState,
    grammar.activeMiningGrammarId,
    grammar.getExamples,
    grammar.getGrammarPoint,
    grammar.getScanState,
    grammar.miningEnabled,
    grammar.state.knownIds,
    grammar.state.learningIds,
  ]);
}

import { describe, expect, it, beforeEach } from "vitest";

import { migrateLegacyJlptDashboardState, normalizeJlptDashboardState } from "@features/jlpt/services/jlptMigrations";
import { getLocalDateKey } from "@features/jlpt/services/jlptConfig";
import { getAppliedDailyTarget, getCurrentStreak, getDerivedDailyTarget, getTodayGrammarProgress, getTodaySnapshotProgress, shouldShowLevel } from "@features/jlpt/services/jlptSelectors";
import type { JlptCatalogTest, JlptDashboardStateV2 } from "@features/jlpt/types";

const catalogTests: JlptCatalogTest[] = [
  {
    id: "JLPTN3_Test1.json",
    name: "JLPTN3_Test1.json",
    level: "N3",
    source: "local",
    path: "/JLPT_Tests/JLPTN3_Test1.json",
  },
];

describe("JLPT dashboard state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates legacy results and JPDB bindings into v2 state", () => {
    localStorage.setItem(
      "prJlptResults",
      JSON.stringify([
        {
          id: "legacy-1",
          completedAt: "2026-04-01T10:00:00.000Z",
          testName: "JLPTN3_Test1",
          level: "N3",
          mode: "exam",
          correct: 12,
          answered: 15,
          total: 20,
          skipped: 5,
          percent: 60,
          pointsEarned: 12,
          pointsTotal: 20,
        },
      ])
    );
    localStorage.setItem(
      "prJlptJpdbDeckBindings",
      JSON.stringify({
        N3: {
          deckId: "15",
          deckName: "Japanese Language Proficiency Test - N3",
          dailyTarget: 20,
        },
      })
    );
    localStorage.setItem(
      "prJlptJpdbDeckProgress",
      JSON.stringify({
        N3: {
          known: 200,
          total: 500,
          loadedAt: "2026-04-10T12:00:00.000Z",
          decks: [{ id: "deck-1", deckId: "15", known: 200, total: 500 }],
        },
      })
    );

    const state = migrateLegacyJlptDashboardState(catalogTests);
    expect(state.activeGoal?.level).toBe("N3");
    expect(state.levels.N3.bindings).toHaveLength(1);
    expect(state.levels.N3.bindings[0].deckId).toBe("15");
    expect(state.levels.N3.snapshots).toHaveLength(1);
    expect(state.levels.N3.grammarSnapshots).toHaveLength(0);
    expect(state.results).toHaveLength(1);
    expect(state.results[0].scope).toBe("full_test");
  });

  it("keeps readiness-only folders visible when hide empty folders is enabled", () => {
    const state = normalizeJlptDashboardState(
      {
        version: 2,
        activeGoal: null,
        levels: {
          N1: { level: "N1", bindings: [], snapshots: [], grammarSnapshots: [] },
          N2: {
            level: "N2",
            bindings: [{ id: "b-1", source: "jpdb", label: "Vocabulary", deckId: "12", enabled: true, dailyTargetOverride: null }],
            snapshots: [],
            grammarSnapshots: [],
          },
          N3: { level: "N3", bindings: [], snapshots: [], grammarSnapshots: [] },
          N4: { level: "N4", bindings: [], snapshots: [], grammarSnapshots: [] },
          N5: { level: "N5", bindings: [], snapshots: [], grammarSnapshots: [] },
        },
        results: [],
        manualCheckIns: [],
        ui: {
          hideEmptyFolders: true,
          collapsedLevels: { N1: false, N2: false, N3: false, N4: false, N5: false },
        },
        updatedAt: "2026-04-14T12:00:00.000Z",
      },
      catalogTests
    );

    expect(shouldShowLevel("N2", state, { N1: [], N2: [], N3: [], N4: [], N5: [] })).toBe(true);
    expect(shouldShowLevel("N1", state, { N1: [], N2: [], N3: [], N4: [], N5: [] })).toBe(false);
  });

  it("derives target, applies overrides, and computes today progress and streak", () => {
    const today = new Date();
    const todayKey = getLocalDateKey(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 10);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const state = normalizeJlptDashboardState(
      {
        version: 2,
        activeGoal: {
          level: "N3",
          testRef: null,
          title: "N3 readiness",
          examDate: tomorrow.toISOString(),
          targetMode: "derived",
          dailyTargetOverride: null,
          updatedAt: today.toISOString(),
        },
        levels: {
          N1: { level: "N1", bindings: [], snapshots: [], grammarSnapshots: [] },
          N2: { level: "N2", bindings: [], snapshots: [], grammarSnapshots: [] },
          N3: {
            level: "N3",
            bindings: [
              { id: "b-1", source: "jpdb", label: "Vocabulary", deckId: "12", enabled: true, dailyTargetOverride: 8 },
            ],
            snapshots: [
              { bindingId: "b-1", checkedAt: `${todayKey}T09:00:00.000Z`, known: 100, total: 200, remaining: 100, progressPercent: 50 },
              { bindingId: "b-1", checkedAt: `${todayKey}T15:00:00.000Z`, known: 112, total: 200, remaining: 88, progressPercent: 56 },
            ],
            lastCheckedAt: `${todayKey}T15:00:00.000Z`,
            grammarSnapshots: [
              { checkedAt: `${todayKey}T09:00:00.000Z`, knownCount: 10, totalCount: 50, remainingCount: 40, progressPercent: 20 },
            ],
          },
          N4: { level: "N4", bindings: [], snapshots: [], grammarSnapshots: [] },
          N5: { level: "N5", bindings: [], snapshots: [], grammarSnapshots: [] },
        },
        results: [],
        manualCheckIns: [
          { date: todayKey, checkedAt: `${todayKey}T10:00:00.000Z` },
          { date: getLocalDateKey(yesterday), checkedAt: `${todayKey}T10:00:00.000Z` },
        ],
        ui: {
          hideEmptyFolders: false,
          collapsedLevels: { N1: false, N2: false, N3: false, N4: false, N5: false },
        },
        updatedAt: today.toISOString(),
      } satisfies JlptDashboardStateV2,
      catalogTests
    );

    expect(getDerivedDailyTarget(state.activeGoal, state.levels.N3)).toBeGreaterThan(0);
    expect(getAppliedDailyTarget(state.activeGoal, state.levels.N3)).toBe(8);
    expect(getTodaySnapshotProgress(state.levels.N3, todayKey)).toBe(12);
    expect(getTodayGrammarProgress(state.levels.N3, 13, todayKey)).toBe(3);
    expect(getCurrentStreak(state.manualCheckIns, todayKey)).toBe(2);
  });

  it("counts progress from the previous snapshot when today only has one check", () => {
    const today = new Date();
    const todayKey = getLocalDateKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = getLocalDateKey(yesterday);

    const state = normalizeJlptDashboardState(
      {
        version: 2,
        activeGoal: null,
        levels: {
          N1: { level: "N1", bindings: [], snapshots: [], grammarSnapshots: [] },
          N2: { level: "N2", bindings: [], snapshots: [], grammarSnapshots: [] },
          N3: {
            level: "N3",
            bindings: [
              { id: "b-1", source: "jpdb", label: "Vocabulary", deckId: "12", enabled: true, dailyTargetOverride: null },
            ],
            snapshots: [
              { bindingId: "b-1", checkedAt: `${yesterdayKey}T21:00:00.000Z`, known: 100, total: 200, remaining: 100, progressPercent: 50 },
              { bindingId: "b-1", checkedAt: `${todayKey}T09:00:00.000Z`, known: 115, total: 200, remaining: 85, progressPercent: 58 },
            ],
            lastCheckedAt: `${todayKey}T09:00:00.000Z`,
            grammarSnapshots: [],
          },
          N4: { level: "N4", bindings: [], snapshots: [], grammarSnapshots: [] },
          N5: { level: "N5", bindings: [], snapshots: [], grammarSnapshots: [] },
        },
        results: [],
        manualCheckIns: [],
        ui: {
          hideEmptyFolders: false,
          collapsedLevels: { N1: false, N2: false, N3: false, N4: false, N5: false },
        },
        updatedAt: today.toISOString(),
      } satisfies JlptDashboardStateV2,
      catalogTests
    );

    expect(getTodaySnapshotProgress(state.levels.N3, todayKey)).toBe(15);
  });

  it("uses grammar snapshots plus the current known count to measure known gain today", () => {
    const today = new Date();
    const todayKey = getLocalDateKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = getLocalDateKey(yesterday);

    const state = normalizeJlptDashboardState(
      {
        version: 2,
        activeGoal: null,
        levels: {
          N1: { level: "N1", bindings: [], snapshots: [], grammarSnapshots: [] },
          N2: {
            level: "N2",
            bindings: [],
            snapshots: [],
            grammarSnapshots: [
              { checkedAt: `${yesterdayKey}T21:00:00.000Z`, knownCount: 10, totalCount: 60, remainingCount: 50, progressPercent: 17 },
              { checkedAt: `${todayKey}T09:00:00.000Z`, knownCount: 12, totalCount: 60, remainingCount: 48, progressPercent: 20 },
            ],
          },
          N3: { level: "N3", bindings: [], snapshots: [], grammarSnapshots: [] },
          N4: { level: "N4", bindings: [], snapshots: [], grammarSnapshots: [] },
          N5: { level: "N5", bindings: [], snapshots: [], grammarSnapshots: [] },
        },
        results: [],
        manualCheckIns: [],
        ui: {
          hideEmptyFolders: false,
          collapsedLevels: { N1: false, N2: false, N3: false, N4: false, N5: false },
        },
        updatedAt: today.toISOString(),
      } satisfies JlptDashboardStateV2,
      catalogTests
    );

    expect(getTodayGrammarProgress(state.levels.N2, 15, todayKey)).toBe(5);
  });
});

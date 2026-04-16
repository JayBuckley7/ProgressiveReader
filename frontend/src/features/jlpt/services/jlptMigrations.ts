import type {
  ActiveJlptGoal,
  GrammarProgressSnapshot,
  JlptCatalogTest,
  JlptDashboardStateV2,
  JlptLevel,
  JlptResultSectionBreakdown,
  JlptResultV2,
  JlptTestRef,
  JpdbDeckBinding,
  JpdbDeckSnapshot,
  LevelReadinessState,
  ManualStudyCheckIn,
} from "@features/jlpt/types";
import {
  JLPT_LEVELS,
  JLPT_RESULT_LIMIT,
  capChronologicalSnapshots,
  capSnapshotsByBinding,
  createEmptyJlptDashboardState,
  createEmptyLevelReadinessState,
  createJpdbDeckBinding,
  createJlptTestRef,
  getDefaultCollapsedLevels,
  getGoalTitle,
  getNextConfiguredJlptExam,
  toJlptLevel,
} from "@features/jlpt/services/jlptConfig";

const LEGACY_RESULTS_KEY = "prJlptResults";
const LEGACY_BINDINGS_KEY = "prJlptJpdbDeckBindings";
const LEGACY_PROGRESS_KEY = "prJlptJpdbDeckProgress";

type LegacyResult = {
  id?: string;
  completedAt?: string;
  testName?: string;
  level?: string;
  mode?: "exam" | "practice";
  correct?: number;
  answered?: number;
  total?: number;
  skipped?: number;
  percent?: number;
  pointsEarned?: number;
  pointsTotal?: number;
};

type LegacyBindingRecord = Record<string, unknown>;
type LegacyProgressRecord = Record<string, unknown>;

function parseJsonValue<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  return next || undefined;
}

function normalizeTestRef(value: unknown, tests: JlptCatalogTest[], fallbackLevel: JlptLevel): JlptTestRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = normalizeText(candidate.id);
  const source = candidate.source === "local" || candidate.source === "library" ? candidate.source : null;
  if (!id || !source) return null;
  const matched =
    tests.find((test) => test.id === id && test.source === source) ||
    tests.find((test) => test.level === fallbackLevel && test.id === id);
  if (matched) return createJlptTestRef(matched);
  const name = normalizeText(candidate.name) || `${fallbackLevel} test`;
  const path = normalizeText(candidate.path);
  return { id, source, name, path };
}

function normalizeBindings(value: unknown): JpdbDeckBinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const binding = item as Record<string, unknown>;
      return createJpdbDeckBinding({
        id: normalizeText(binding.id),
        label: normalizeText(binding.label) || "",
        deckId: normalizeText(binding.deckId) || "",
        deckName: normalizeText(binding.deckName),
        enabled: typeof binding.enabled === "boolean" ? binding.enabled : true,
        dailyTargetOverride: normalizeNumber(binding.dailyTargetOverride ?? binding.dailyTarget ?? null, 0) || null,
      });
    })
    .filter((binding): binding is JpdbDeckBinding => Boolean(binding));
}

function normalizeSnapshots(value: unknown): JpdbDeckSnapshot[] {
  if (!Array.isArray(value)) return [];
  return capSnapshotsByBinding(
    value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const snapshot = item as Record<string, unknown>;
        const bindingId = normalizeText(snapshot.bindingId);
        const checkedAt = normalizeText(snapshot.checkedAt);
        if (!bindingId || !checkedAt) return null;
        const known = normalizeNumber(snapshot.known);
        const total = normalizeNumber(snapshot.total);
        return {
          bindingId,
          checkedAt,
          known,
          total,
          remaining: Math.max(0, normalizeNumber(snapshot.remaining, total - known)),
          progressPercent: normalizeNumber(snapshot.progressPercent, total > 0 ? Math.round((known / total) * 100) : 0),
        } satisfies JpdbDeckSnapshot;
      })
      .filter((snapshot): snapshot is JpdbDeckSnapshot => Boolean(snapshot))
  );
}

function normalizeGrammarSnapshots(value: unknown): GrammarProgressSnapshot[] {
  if (!Array.isArray(value)) return [];
  return capChronologicalSnapshots(
    value
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const snapshot = item as Record<string, unknown>;
        const checkedAt = normalizeText(snapshot.checkedAt);
        if (!checkedAt) return null;
        const knownCount = normalizeNumber(snapshot.knownCount ?? snapshot.known);
        const totalCount = normalizeNumber(snapshot.totalCount ?? snapshot.total);
        return {
          checkedAt,
          knownCount,
          totalCount,
          remainingCount: Math.max(0, normalizeNumber(snapshot.remainingCount, totalCount - knownCount)),
          progressPercent: normalizeNumber(snapshot.progressPercent, totalCount > 0 ? Math.round((knownCount / totalCount) * 100) : 0),
        } satisfies GrammarProgressSnapshot;
      })
      .filter((snapshot): snapshot is GrammarProgressSnapshot => Boolean(snapshot))
  );
}

function normalizeSectionBreakdown(value: unknown): JlptResultSectionBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const section = item as Record<string, unknown>;
      const total = normalizeNumber(section.total);
      const correct = normalizeNumber(section.correct);
      return {
        sectionId: normalizeText(section.sectionId) || `section-${index + 1}`,
        sectionLabel: normalizeText(section.sectionLabel) || `Section ${index + 1}`,
        correct,
        answered: normalizeNumber(section.answered),
        total,
        skipped: normalizeNumber(section.skipped),
        percent: normalizeNumber(section.percent, total > 0 ? Math.round((correct / total) * 100) : 0),
        pointsEarned: normalizeNumber(section.pointsEarned),
        pointsTotal: normalizeNumber(section.pointsTotal),
      } satisfies JlptResultSectionBreakdown;
    })
    .filter((section): section is JlptResultSectionBreakdown => Boolean(section));
}

function normalizeResult(value: unknown, tests: JlptCatalogTest[]): JlptResultV2 | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const level = toJlptLevel(result.level) || toJlptLevel(normalizeText(result.testName)?.match(/N[1-5]/)?.[0] || null);
  if (!level) return null;
  const testRef = normalizeTestRef(result.testRef, tests, level);
  const total = normalizeNumber(result.total);
  const correct = normalizeNumber(result.correct);
  return {
    id: normalizeText(result.id) || `legacy-${Math.random().toString(36).slice(2, 10)}`,
    completedAt: normalizeText(result.completedAt) || new Date().toISOString(),
    level,
    testRef,
    testName: normalizeText(result.testName) || testRef?.name || `${level} test`,
    mode: result.mode === "practice" ? "practice" : "exam",
    scope: "full_test",
    correct,
    answered: normalizeNumber(result.answered),
    total,
    skipped: normalizeNumber(result.skipped),
    percent: normalizeNumber(result.percent, total > 0 ? Math.round((correct / total) * 100) : 0),
    pointsEarned: normalizeNumber(result.pointsEarned),
    pointsTotal: normalizeNumber(result.pointsTotal),
    sectionBreakdown: normalizeSectionBreakdown(result.sectionBreakdown),
  };
}

function normalizeManualCheckIns(value: unknown): ManualStudyCheckIn[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Map<string, ManualStudyCheckIn>();
  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const entry = item as Record<string, unknown>;
    const date = normalizeText(entry.date);
    const checkedAt = normalizeText(entry.checkedAt);
    if (!date || !checkedAt) return;
    deduped.set(date, { date, checkedAt });
  });
  return [...deduped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getLevelState(value: unknown, level: JlptLevel): LevelReadinessState {
  if (!value || typeof value !== "object") return createEmptyLevelReadinessState(level);
  const state = value as Record<string, unknown>;
  const snapshots = normalizeSnapshots(state.snapshots);
  const grammarSnapshots = normalizeGrammarSnapshots(state.grammarSnapshots);
  const lastCheckedAt = normalizeText(state.lastCheckedAt) || snapshots[snapshots.length - 1]?.checkedAt;
  const lastGrammarCheckedAt = normalizeText(state.lastGrammarCheckedAt) || grammarSnapshots[grammarSnapshots.length - 1]?.checkedAt;
  return {
    level,
    bindings: normalizeBindings(state.bindings),
    snapshots,
    lastCheckedAt,
    grammarSnapshots,
    lastGrammarCheckedAt,
  };
}

function seedActiveGoal(tests: JlptCatalogTest[], levels: Record<JlptLevel, LevelReadinessState>, results: JlptResultV2[]): ActiveJlptGoal {
  const latestResultLevel =
    [...results].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]?.level || null;
  const levelWithBindings = JLPT_LEVELS.find((level) => levels[level].bindings.length > 0) || null;
  const levelWithTests = JLPT_LEVELS.find((level) => tests.some((test) => test.level === level)) || null;
  const level = latestResultLevel || levelWithBindings || levelWithTests || "N5";
  return {
    level,
    testRef: null,
    title: getGoalTitle(level, null),
    examDate: getNextConfiguredJlptExam().toISOString(),
    targetMode: "derived",
    dailyTargetOverride: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeActiveGoal(value: unknown, tests: JlptCatalogTest[], fallbackLevel: JlptLevel): ActiveJlptGoal | null {
  if (!value || typeof value !== "object") return null;
  const goal = value as Record<string, unknown>;
  const level = toJlptLevel(goal.level) || fallbackLevel;
  const testRef = normalizeTestRef(goal.testRef, tests, level);
  return {
    level,
    testRef,
    title: normalizeText(goal.title) || getGoalTitle(level, testRef),
    examDate: normalizeText(goal.examDate) || getNextConfiguredJlptExam().toISOString(),
    targetMode: goal.targetMode === "override" ? "override" : "derived",
    dailyTargetOverride: normalizeNumber(goal.dailyTargetOverride, 0) || null,
    updatedAt: normalizeText(goal.updatedAt) || new Date().toISOString(),
  };
}

export function normalizeJlptDashboardState(value: unknown, tests: JlptCatalogTest[]): JlptDashboardStateV2 {
  const empty = createEmptyJlptDashboardState();
  if (!value || typeof value !== "object") {
    return {
      ...empty,
      activeGoal: seedActiveGoal(tests, empty.levels, empty.results),
    };
  }

  const state = value as Record<string, unknown>;
  const rawLevels = state.levels && typeof state.levels === "object" ? (state.levels as Record<string, unknown>) : {};
  const levels = JLPT_LEVELS.reduce<Record<JlptLevel, LevelReadinessState>>((acc, level) => {
    acc[level] = getLevelState(rawLevels[level], level);
    return acc;
  }, {} as Record<JlptLevel, LevelReadinessState>);

  const results = (Array.isArray(state.results) ? state.results : [])
    .map((result) => normalizeResult(result, tests))
    .filter((result): result is JlptResultV2 => Boolean(result))
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
    .slice(-JLPT_RESULT_LIMIT);

  const activeGoal =
    normalizeActiveGoal(state.activeGoal, tests, results[results.length - 1]?.level || "N5") ||
    seedActiveGoal(tests, levels, results);

  if (activeGoal.testRef) {
    const matched = tests.find((test) => test.id === activeGoal.testRef?.id && test.source === activeGoal.testRef?.source);
    if (!matched) {
      activeGoal.testRef = null;
      activeGoal.title = getGoalTitle(activeGoal.level, null);
    } else {
      activeGoal.title = getGoalTitle(activeGoal.level, matched);
      activeGoal.testRef = createJlptTestRef(matched);
    }
  }

  const rawUi = state.ui && typeof state.ui === "object" ? (state.ui as Record<string, unknown>) : {};
  const rawCollapsed = rawUi.collapsedLevels && typeof rawUi.collapsedLevels === "object" ? (rawUi.collapsedLevels as Record<string, unknown>) : {};
  const collapsedLevels = JLPT_LEVELS.reduce<Record<JlptLevel, boolean>>((acc, level) => {
    acc[level] = Boolean(rawCollapsed[level]);
    return acc;
  }, getDefaultCollapsedLevels());

  return {
    version: 2,
    activeGoal,
    levels,
    results,
    manualCheckIns: normalizeManualCheckIns(state.manualCheckIns),
    ui: {
      hideEmptyFolders: Boolean(rawUi.hideEmptyFolders),
      collapsedLevels,
    },
    updatedAt: normalizeText(state.updatedAt) || activeGoal.updatedAt || new Date().toISOString(),
  };
}

export function touchJlptDashboardState(state: JlptDashboardStateV2, tests: JlptCatalogTest[]): JlptDashboardStateV2 {
  const normalized = normalizeJlptDashboardState(state, tests);
  return {
    ...normalized,
    activeGoal: normalized.activeGoal
      ? {
          ...normalized.activeGoal,
          title: getGoalTitle(normalized.activeGoal.level, normalized.activeGoal.testRef),
          updatedAt: new Date().toISOString(),
        }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

export function migrateLegacyJlptDashboardState(tests: JlptCatalogTest[]): JlptDashboardStateV2 {
  const empty = createEmptyJlptDashboardState();
  if (typeof window === "undefined") {
    return {
      ...empty,
      activeGoal: seedActiveGoal(tests, empty.levels, empty.results),
    };
  }

  const legacyResults = parseJsonValue<LegacyResult[]>(window.localStorage.getItem(LEGACY_RESULTS_KEY)) || [];
  const legacyBindings = parseJsonValue<LegacyBindingRecord>(window.localStorage.getItem(LEGACY_BINDINGS_KEY)) || {};
  const legacyProgress = parseJsonValue<LegacyProgressRecord>(window.localStorage.getItem(LEGACY_PROGRESS_KEY)) || {};

  const levels = JLPT_LEVELS.reduce<Record<JlptLevel, LevelReadinessState>>((acc, level) => {
    const next = createEmptyLevelReadinessState(level);
    const rawBindings = legacyBindings[level];

    if (Array.isArray(rawBindings)) {
      next.bindings = normalizeBindings(rawBindings);
    } else if (rawBindings && typeof rawBindings === "object") {
      const maybeBinding = rawBindings as Record<string, unknown>;
      if (normalizeText(maybeBinding.deckId)) {
        next.bindings = [
          createJpdbDeckBinding({
            id: normalizeText(maybeBinding.id),
            label: normalizeText(maybeBinding.label) || "",
            deckId: normalizeText(maybeBinding.deckId) || "",
            deckName: normalizeText(maybeBinding.deckName),
            dailyTargetOverride: normalizeNumber(maybeBinding.dailyTarget ?? maybeBinding.dailyTargetOverride, 0) || null,
          }),
        ];
      }
    }

    const rawProgress = legacyProgress[level];
    if (rawProgress && typeof rawProgress === "object") {
      const progress = rawProgress as Record<string, unknown>;
      const loadedAt = normalizeText(progress.loadedAt) || new Date().toISOString();
      const decks = Array.isArray(progress.decks) ? progress.decks : [];
      next.snapshots = decks
        .map((deck) => {
          if (!deck || typeof deck !== "object") return null;
          const item = deck as Record<string, unknown>;
          const deckId = normalizeText(item.deckId) || "";
          let binding = next.bindings.find((entry) => entry.id === normalizeText(item.id));
          if (!binding && deckId) {
            binding = next.bindings.find((entry) => entry.deckId === deckId);
          }
          if (!binding && deckId) {
            binding = createJpdbDeckBinding({
              id: normalizeText(item.id),
              label: normalizeText(item.label) || "",
              deckId,
              deckName: normalizeText(item.deckName),
            });
            next.bindings.push(binding);
          }
          if (!binding) return null;
          const known = normalizeNumber(item.known);
          const total = normalizeNumber(item.total);
          return {
            bindingId: binding.id,
            checkedAt: loadedAt,
            known,
            total,
            remaining: Math.max(0, total - known),
            progressPercent: total > 0 ? Math.round((known / total) * 100) : 0,
          } satisfies JpdbDeckSnapshot;
        })
        .filter((snapshot): snapshot is JpdbDeckSnapshot => Boolean(snapshot));
      next.lastCheckedAt = loadedAt;
    }

    acc[level] = next;
    return acc;
  }, {} as Record<JlptLevel, LevelReadinessState>);

  const results = legacyResults
    .map((result) => normalizeResult(result, tests))
    .filter((result): result is JlptResultV2 => Boolean(result))
    .slice(-JLPT_RESULT_LIMIT);

  return touchJlptDashboardState(
    {
      version: 2,
      activeGoal: seedActiveGoal(tests, levels, results),
      levels,
      results,
      manualCheckIns: [],
      ui: {
        hideEmptyFolders: false,
        collapsedLevels: getDefaultCollapsedLevels(),
      },
      updatedAt: new Date().toISOString(),
    },
    tests
  );
}

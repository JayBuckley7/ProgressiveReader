import type {
  ActiveJlptGoal,
  GrammarProgressSnapshot,
  JlptCatalogTest,
  JlptDashboardStateV2,
  JlptLevel,
  JlptResultV2,
  JpdbDeckBinding,
  JpdbDeckSnapshot,
  LevelReadinessState,
  ManualStudyCheckIn,
} from "@features/jlpt/types";
import { JLPT_LEVELS, getDaysUntilDate, getGoalTitle, getLocalDateKey } from "@features/jlpt/services/jlptConfig";

export type LevelReadinessSummary = {
  known: number;
  total: number;
  remaining: number;
  percent: number;
  deckCount: number;
  enabledDeckCount: number;
  lastCheckedAt?: string;
  latestByBinding: Record<string, JpdbDeckSnapshot>;
};

function sortSnapshots(snapshots: JpdbDeckSnapshot[]): JpdbDeckSnapshot[] {
  return [...snapshots].sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime());
}

function sortGrammarSnapshots(snapshots: GrammarProgressSnapshot[]): GrammarProgressSnapshot[] {
  return [...snapshots].sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime());
}

export function getLatestSnapshotsByBinding(levelState: LevelReadinessState): Record<string, JpdbDeckSnapshot> {
  const latest: Record<string, JpdbDeckSnapshot> = {};
  for (const snapshot of sortSnapshots(levelState.snapshots)) {
    latest[snapshot.bindingId] = snapshot;
  }
  return latest;
}

export function getLevelReadinessSummary(
  levelState: LevelReadinessState,
  options: { enabledOnly?: boolean } = {}
): LevelReadinessSummary {
  const enabledOnly = options.enabledOnly ?? false;
  const latestByBinding = getLatestSnapshotsByBinding(levelState);
  const bindingLookup = new Map(levelState.bindings.map((binding) => [binding.id, binding]));
  let known = 0;
  let total = 0;

  Object.entries(latestByBinding).forEach(([bindingId, snapshot]) => {
    const binding = bindingLookup.get(bindingId);
    if (!binding) return;
    if (enabledOnly && !binding.enabled) return;
    known += snapshot.known;
    total += snapshot.total;
  });

  return {
    known,
    total,
    remaining: Math.max(0, total - known),
    percent: total > 0 ? Math.round((known / total) * 100) : 0,
    deckCount: levelState.bindings.length,
    enabledDeckCount: levelState.bindings.filter((binding) => binding.enabled).length,
    lastCheckedAt: levelState.lastCheckedAt,
    latestByBinding,
  };
}

export function getBindingSnapshot(levelState: LevelReadinessState, bindingId: string): JpdbDeckSnapshot | null {
  return getLatestSnapshotsByBinding(levelState)[bindingId] || null;
}

export function getBindingOverrideTarget(bindings: JpdbDeckBinding[]): number {
  return bindings.reduce((sum, binding) => {
    if (!binding.enabled || !binding.dailyTargetOverride || binding.dailyTargetOverride <= 0) return sum;
    return sum + binding.dailyTargetOverride;
  }, 0);
}

export function getDerivedDailyTarget(goal: ActiveJlptGoal | null, levelState: LevelReadinessState): number {
  if (!goal) return 0;
  const summary = getLevelReadinessSummary(levelState, { enabledOnly: true });
  if (summary.remaining <= 0) return 0;
  const days = Math.max(1, getDaysUntilDate(goal.examDate));
  return Math.ceil(summary.remaining / days);
}

export function getAppliedDailyTarget(goal: ActiveJlptGoal | null, levelState: LevelReadinessState): number {
  if (!goal) return 0;
  if (goal.targetMode === "override" && goal.dailyTargetOverride && goal.dailyTargetOverride > 0) {
    return goal.dailyTargetOverride;
  }

  const bindingOverride = getBindingOverrideTarget(levelState.bindings);
  if (bindingOverride > 0) return bindingOverride;
  return getDerivedDailyTarget(goal, levelState);
}

export function getTodaySnapshotProgress(levelState: LevelReadinessState, today = getLocalDateKey()): number {
  let progress = 0;
  for (const binding of levelState.bindings) {
    if (!binding.enabled) continue;
    const snapshots = sortSnapshots(levelState.snapshots).filter((snapshot) => snapshot.bindingId === binding.id);
    const todaySnapshots = snapshots.filter((snapshot) => getLocalDateKey(snapshot.checkedAt) === today);
    const latestToday = todaySnapshots[todaySnapshots.length - 1];
    if (!latestToday) continue;

    const previousSnapshot = [...snapshots]
      .reverse()
      .find((snapshot) => getLocalDateKey(snapshot.checkedAt) < today);
    const baselineKnown = previousSnapshot?.known ?? todaySnapshots[0].known;
    progress += Math.max(0, latestToday.known - baselineKnown);
  }
  return progress;
}

export function getLatestGrammarSnapshot(levelState: LevelReadinessState): GrammarProgressSnapshot | null {
  const snapshots = sortGrammarSnapshots(levelState.grammarSnapshots);
  return snapshots[snapshots.length - 1] || null;
}

export function getTodayGrammarProgress(
  levelState: LevelReadinessState,
  currentKnownCount?: number,
  today = getLocalDateKey()
): number {
  const snapshots = sortGrammarSnapshots(levelState.grammarSnapshots);
  const todaySnapshots = snapshots.filter((snapshot) => getLocalDateKey(snapshot.checkedAt) === today);
  const previousSnapshot = [...snapshots]
    .reverse()
    .find((snapshot) => getLocalDateKey(snapshot.checkedAt) < today);

  const latestKnown =
    typeof currentKnownCount === "number"
      ? currentKnownCount
      : todaySnapshots[todaySnapshots.length - 1]?.knownCount ?? previousSnapshot?.knownCount ?? 0;
  const baselineKnown = previousSnapshot?.knownCount ?? todaySnapshots[0]?.knownCount ?? latestKnown;
  return Math.max(0, latestKnown - baselineKnown);
}

export function getCurrentStreak(checkIns: ManualStudyCheckIn[], today = getLocalDateKey()): number {
  const dates = new Set(checkIns.map((entry) => entry.date));
  if (!dates.has(today)) return 0;

  let streak = 0;
  const [year, month, day] = today.split("-").map((part) => Number(part));
  let cursor = new Date(year, month - 1, day);
  while (dates.has(getLocalDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function hasTodayCheckIn(checkIns: ManualStudyCheckIn[], today = getLocalDateKey()): boolean {
  return checkIns.some((entry) => entry.date === today);
}

export function getLastCheckInDate(checkIns: ManualStudyCheckIn[]): string | null {
  if (checkIns.length === 0) return null;
  return [...checkIns]
    .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime())
    .slice(-1)[0]?.date || null;
}

export function groupTestsByLevel(tests: JlptCatalogTest[]): Record<JlptLevel, JlptCatalogTest[]> {
  return JLPT_LEVELS.reduce<Record<JlptLevel, JlptCatalogTest[]>>((acc, level) => {
    acc[level] = tests.filter((test) => test.level === level);
    return acc;
  }, {} as Record<JlptLevel, JlptCatalogTest[]>);
}

export function shouldShowLevel(
  level: JlptLevel,
  state: JlptDashboardStateV2,
  testsByLevel: Record<JlptLevel, JlptCatalogTest[]>
): boolean {
  if (!state.ui.hideEmptyFolders) return true;
  const levelState = state.levels[level];
  const hasTests = (testsByLevel[level]?.length ?? 0) > 0;
  const hasBindings = levelState.bindings.length > 0;
  const hasSnapshots = levelState.snapshots.length > 0;
  const isActive = state.activeGoal?.level === level;
  return hasTests || hasBindings || hasSnapshots || isActive;
}

export function getVisibleLevels(state: JlptDashboardStateV2, testsByLevel: Record<JlptLevel, JlptCatalogTest[]>): JlptLevel[] {
  return JLPT_LEVELS.filter((level) => shouldShowLevel(level, state, testsByLevel));
}

export function getExamTrendResults(results: JlptResultV2[]): JlptResultV2[] {
  return [...results]
    .filter((result) => result.mode === "exam" && result.scope === "full_test")
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
}

export function getResolvedGoalTitle(goal: ActiveJlptGoal | null): string {
  if (!goal) return "No active goal";
  return goal.title || getGoalTitle(goal.level, goal.testRef);
}

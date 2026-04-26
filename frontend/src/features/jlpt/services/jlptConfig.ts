import type {
  JlptCatalogTest,
  JlptDashboardStateV2,
  JlptLevel,
  JlptTestRef,
  JpdbDeckBinding,
  LevelReadinessState,
} from "@features/jlpt/types";

export const JLPT_LEVELS: JlptLevel[] = ["N1", "N2", "N3", "N4", "N5"];
export const JLPT_DASHBOARD_STORAGE_PREFIX = "prJlptDashboardStateV2";
export const JLPT_METADATA_KEY = "jlpt_dashboard_v2";
export const JLPT_RESULT_LIMIT = 50;
export const JLPT_SNAPSHOT_LIMIT_PER_BINDING = 16;
export const JLPT_GRAMMAR_SNAPSHOT_LIMIT = 16;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAME_PATTERN = "January|February|March|April|May|June|July|August|September|October|November|December";

export function createJlptId(prefix = "jlpt"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function toJlptLevel(value: unknown): JlptLevel | null {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().trim();
  return JLPT_LEVELS.includes(normalized as JlptLevel) ? (normalized as JlptLevel) : null;
}

export function extractJlptLevel(value: string, meta?: { level?: string | null }): JlptLevel | null {
  const metaLevel = toJlptLevel(meta?.level ?? null);
  if (metaLevel) return metaLevel;
  const match = value.toUpperCase().match(/N[1-5]/)?.[0];
  return toJlptLevel(match ?? null);
}

export function formatJlptTestTitle(value: string): string {
  const withoutExtension = value.replace(/\.json$/i, "").trim();
  let title = withoutExtension.replace(/[_-]+/g, " ");

  title = title.replace(/\bJLPT([Nn][1-5])\b/g, (_match, level: string) => `JLPT ${level.toUpperCase()}`);
  title = title.replace(/\bJLPT\s+([Nn][1-5])\b/g, (_match, level: string) => `JLPT ${level.toUpperCase()}`);
  title = title.replace(new RegExp(`\\b(${MONTH_NAME_PATTERN})(\\d{4})\\b`, "gi"), "$1 $2");
  title = title.replace(new RegExp(`\\b(\\d{4})(${MONTH_NAME_PATTERN})\\b`, "gi"), "$1 $2");
  title = title.replace(/\b(Test|Exam|Mock|Practice|Part)(\d+)\b/gi, "$1 $2");
  title = title.replace(/\bPartial\b/gi, "(Partial)");
  title = title.replace(/\s+\(Partial\)\s+\(Partial\)\b/gi, " (Partial)");
  title = title.replace(/\s+(Nihonez)(\s+\(Partial\))?$/i, " - $1$2");
  title = title.replace(/\s+/g, " ").trim();

  return title;
}

export function createJlptTestRef(test: Pick<JlptCatalogTest, "id" | "source" | "name" | "path">): JlptTestRef {
  return {
    id: test.id,
    source: test.source,
    name: test.name,
    path: test.path,
  };
}

export function createEmptyLevelReadinessState(level: JlptLevel): LevelReadinessState {
  return {
    level,
    bindings: [],
    snapshots: [],
    lastCheckedAt: undefined,
    grammarSnapshots: [],
    lastGrammarCheckedAt: undefined,
  };
}

export function createJpdbDeckBinding(overrides: Partial<JpdbDeckBinding> = {}): JpdbDeckBinding {
  return {
    id: overrides.id || createJlptId("jpdb"),
    source: "jpdb",
    label: overrides.label || "",
    deckId: overrides.deckId || "",
    deckName: overrides.deckName,
    enabled: overrides.enabled ?? true,
    dailyTargetOverride:
      typeof overrides.dailyTargetOverride === "number" && overrides.dailyTargetOverride > 0
        ? Math.round(overrides.dailyTargetOverride)
        : null,
  };
}

export function getDefaultCollapsedLevels(): Record<JlptLevel, boolean> {
  return JLPT_LEVELS.reduce<Record<JlptLevel, boolean>>((acc, level) => {
    acc[level] = false;
    return acc;
  }, {} as Record<JlptLevel, boolean>);
}

export function createEmptyJlptDashboardState(): JlptDashboardStateV2 {
  const now = new Date().toISOString();
  return {
    version: 2,
    activeGoal: null,
    levels: JLPT_LEVELS.reduce<Record<JlptLevel, LevelReadinessState>>((acc, level) => {
      acc[level] = createEmptyLevelReadinessState(level);
      return acc;
    }, {} as Record<JlptLevel, LevelReadinessState>),
    results: [],
    manualCheckIns: [],
    ui: {
      hideEmptyFolders: false,
      collapsedLevels: getDefaultCollapsedLevels(),
    },
    updatedAt: now,
  };
}

export function getJlptStorageKey(userId: string | null | undefined): string {
  return `${JLPT_DASHBOARD_STORAGE_PREFIX}:${userId || "anonymous"}`;
}

export function getLocalDateKey(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getStartOfLocalDay(value: Date | string = new Date()): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getFirstSunday(year: number, monthIndex: number): Date {
  const first = new Date(year, monthIndex, 1, 9, 0, 0, 0);
  const offset = (7 - first.getDay()) % 7;
  first.setDate(first.getDate() + offset);
  return first;
}

export function getUpcomingJlptExamDates(referenceDate: Date = new Date(), count = 6): Date[] {
  const dates: Date[] = [];
  for (let year = referenceDate.getFullYear(); dates.length < count; year += 1) {
    dates.push(getFirstSunday(year, 6));
    dates.push(getFirstSunday(year, 11));
  }

  return dates
    .filter((date) => date.getTime() >= referenceDate.getTime() - DAY_MS)
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, count);
}

export function getNextConfiguredJlptExam(referenceDate: Date = new Date()): Date {
  return getUpcomingJlptExamDates(referenceDate, 1)[0];
}

export function getGoalTitle(level: JlptLevel, testRef: JlptTestRef | null): string {
  if (!testRef) return `${level} readiness`;
  return formatJlptTestTitle(testRef.name);
}

export function getDaysUntilDate(target: Date | string, referenceDate: Date = new Date()): number {
  const start = getStartOfLocalDay(referenceDate);
  const endDate = target instanceof Date ? target : new Date(target);
  const end = getStartOfLocalDay(endDate);
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
}

export function capSnapshotsByBinding<T extends { bindingId: string; checkedAt: string }>(
  snapshots: T[],
  maxPerBinding = JLPT_SNAPSHOT_LIMIT_PER_BINDING
): T[] {
  const grouped = new Map<string, T[]>();
  for (const snapshot of snapshots) {
    const current = grouped.get(snapshot.bindingId) || [];
    current.push(snapshot);
    grouped.set(snapshot.bindingId, current);
  }

  const next: T[] = [];
  for (const items of grouped.values()) {
    items
      .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime())
      .slice(-maxPerBinding)
      .forEach((item) => next.push(item));
  }

  return next.sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime());
}

export function capChronologicalSnapshots<T extends { checkedAt: string }>(snapshots: T[], max = JLPT_GRAMMAR_SNAPSHOT_LIMIT): T[] {
  return [...snapshots]
    .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime())
    .slice(-max);
}

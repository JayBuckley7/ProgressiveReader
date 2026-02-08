import type { JpdbLookupVocabularyEntry } from "@features/vocabulary/services/vocabApi";

export type DueBucketKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export type DueGroup = {
  key: DueBucketKey;
  label: string;
  defaultOpen: boolean;
  entries: JpdbLookupVocabularyEntry[];
};

const MS_DAY = 24 * 60 * 60 * 1000;

export function normalizeEpochMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  // seconds ≈ 1.7e9, milliseconds ≈ 1.7e12, microseconds ≈ 1.7e15
  if (value > 1e14) return Math.floor(value / 1000);
  if (value > 1e11) return Math.floor(value);
  return Math.floor(value * 1000);
}

export function formatDueAt(value: unknown): string | null {
  const dueAtMs = normalizeEpochMs(value);
  if (dueAtMs === null) return null;
  return new Date(dueAtMs).toLocaleString();
}

export function formatDueDate(value: unknown): string | null {
  const dueAtMs = normalizeEpochMs(value);
  if (dueAtMs === null) return null;
  return new Date(dueAtMs).toLocaleDateString();
}

export function isDueEntry(entry: JpdbLookupVocabularyEntry, nowMs: number): boolean {
  const dueAt = normalizeEpochMs(entry.due_at);
  if (dueAt !== null) return dueAt <= nowMs;

  const state = entry.card_state;
  if (typeof state === "string") return state.toLowerCase().includes("due");
  if (Array.isArray(state)) {
    return state.some((s) => typeof s === "string" && s.toLowerCase().includes("due"));
  }
  return false;
}

export function groupDeckVocabularyByDueAt(entries: JpdbLookupVocabularyEntry[]): DueGroup[] {
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
    const dueAtMs = normalizeEpochMs(entry.due_at);
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
    const aDue = normalizeEpochMs(a.due_at) ?? Number.POSITIVE_INFINITY;
    const bDue = normalizeEpochMs(b.due_at) ?? Number.POSITIVE_INFINITY;
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


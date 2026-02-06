export type JpdbMirrorVersion = 1;

export type JpdbVocabId = `${number}/${number}`;

export interface JpdbMirrorDeckSummary {
  id: string;
  name: string;
  words?: number | null;
}

export interface JpdbMirrorMeta {
  version: JpdbMirrorVersion;
  syncedAtMs: number;
  knownEntryCount: number;
  sourceDecks: JpdbMirrorDeckSummary[];
}

export interface JpdbKnownVocabRecord {
  id: JpdbVocabId;
  vid: number;
  sid: number;
  spelling: string;
  reading?: string;
  meanings: string[];
  frequencyRank?: number | null;
  cardState: string[];
  dueAtMs?: number | null;
  updatedAtMs: number;
}

export interface JpdbGlossIndexRow {
  gloss: string;
  candidateIds: JpdbVocabId[];
  builtAtMs: number;
}

export function toVocabId(vid: number, sid: number): JpdbVocabId {
  return `${vid}/${sid}`;
}

export function normalizeCardState(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return [trimmed.toLowerCase()];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      out.push(trimmed.toLowerCase());
    }
    return out;
  }
  return [];
}

export function isKnownState(cardState: string[]): boolean {
  const s = new Set(cardState.map((x) => x.toLowerCase()));
  return (
    s.has("known") ||
    s.has("never-forget") ||
    s.has("never_forget") ||
    s.has("neverforget")
  );
}

export function normalizeDueAtMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  // seconds ≈ 1.7e9, milliseconds ≈ 1.7e12, microseconds ≈ 1.7e15
  if (value > 1e14) return Math.floor(value / 1000);
  if (value > 1e11) return Math.floor(value);
  return Math.floor(value * 1000);
}


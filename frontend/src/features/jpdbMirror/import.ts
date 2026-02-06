import { buildGlossIndexRows } from "./indexBuild";
import { writeMirrorSnapshot } from "./db";
import { isKnownState, normalizeCardState, normalizeDueAtMs, toVocabId } from "./types";
import type { JpdbKnownVocabRecord, JpdbMirrorMeta } from "./types";

export interface JpdbMirrorDriveSnapshotV1 {
  version: 1;
  syncedAtMs: number;
  sourceDecks?: Array<{ id: string; name: string; words?: number | null }>;
  knownVocab: Array<{
    id?: string;
    vid: number;
    sid: number;
    spelling: string;
    reading?: string;
    meanings?: unknown;
    frequencyRank?: number | null;
    frequency_rank?: number | null;
    cardState?: unknown;
    card_state?: unknown;
    dueAtMs?: unknown;
    due_at?: unknown;
  }>;
}

function normalizeMeanings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string") as string[];
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function isValidDriveSnapshot(snapshot: unknown): snapshot is JpdbMirrorDriveSnapshotV1 {
  if (!snapshot || typeof snapshot !== "object") return false;
  const s = snapshot as any;
  return s.version === 1 && typeof s.syncedAtMs === "number" && Array.isArray(s.knownVocab);
}

export async function importMirrorSnapshotFromDrive(snapshot: JpdbMirrorDriveSnapshotV1): Promise<JpdbMirrorMeta> {
  const builtAtMs = Date.now();
  const updatedAtMs = builtAtMs;

  const knownRecords: JpdbKnownVocabRecord[] = [];
  for (const row of snapshot.knownVocab) {
    const vid = Number(row?.vid);
    const sid = Number(row?.sid);
    if (!Number.isFinite(vid) || !Number.isFinite(sid)) continue;

    const spelling = typeof row?.spelling === "string" ? row.spelling : "";
    if (!spelling) continue;

    const reading = typeof row?.reading === "string" && row.reading.trim() ? row.reading : undefined;
    const meanings = normalizeMeanings(row?.meanings);

    const frequencyRankRaw = (row as any).frequencyRank ?? (row as any).frequency_rank;
    const frequencyRank =
      typeof frequencyRankRaw === "number" && Number.isFinite(frequencyRankRaw) ? frequencyRankRaw : null;

    const cardState = normalizeCardState((row as any).cardState ?? (row as any).card_state);
    if (!isKnownState(cardState)) continue;

    const dueAtMs = normalizeDueAtMs((row as any).dueAtMs ?? (row as any).due_at);

    knownRecords.push({
      id: toVocabId(vid, sid),
      vid,
      sid,
      spelling,
      reading,
      meanings,
      frequencyRank,
      cardState,
      dueAtMs: dueAtMs ?? null,
      updatedAtMs,
    });
  }

  const glossIndexRows = buildGlossIndexRows(knownRecords, builtAtMs);

  const meta: JpdbMirrorMeta = {
    version: 1,
    syncedAtMs: snapshot.syncedAtMs || builtAtMs,
    knownEntryCount: knownRecords.length,
    sourceDecks: Array.isArray(snapshot.sourceDecks)
      ? snapshot.sourceDecks.map((d) => ({
          id: String((d as any).id ?? ""),
          name: String((d as any).name ?? ""),
          words: (d as any).words ?? null,
        }))
      : [],
  };

  await writeMirrorSnapshot({ meta, knownVocab: knownRecords, glossIndexRows });
  return meta;
}


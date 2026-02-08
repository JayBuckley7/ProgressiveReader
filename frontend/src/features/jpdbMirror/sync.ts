import type { VocabularyBackendPort } from "@core/backend/ports";
import type { DrivePort } from "@core/drive/ports";

import type { Deck } from "~/types/api";

import { getMirrorMeta, writeMirrorSnapshot } from "./db";
import { buildGlossIndexRows } from "./indexBuild";
import {
  isKnownState,
  normalizeCardState,
  normalizeDueAtMs,
  toVocabId,
  type JpdbKnownVocabRecord,
  type JpdbMirrorMeta,
} from "./types";

export type JpdbMirrorSyncPhase =
  | "decks"
  | "pairs"
  | "lookup"
  | "index"
  | "save"
  | "backup";

export interface JpdbMirrorSyncProgress {
  phase: JpdbMirrorSyncPhase;
  loaded?: number;
  total?: number;
  message?: string;
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  abortIfNeeded(signal);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let onAbort: (() => void) | null = null;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    };
    const id = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    onAbort = () => {
      clearTimeout(id);
      cleanup();
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort);
  });
}

function nowMs(): number {
  return Date.now();
}

function normalizeMeanings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((x) => typeof x === "string") as string[];
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export async function syncJpdbKnownMirror(args: {
  backend: VocabularyBackendPort;
  drive?: DrivePort;
  signal?: AbortSignal;
  onProgress?: (p: JpdbMirrorSyncProgress) => void;
  backupToDrive?: boolean;
}): Promise<void> {
  const backend = args.backend;
  const drive = args.drive;
  const signal = args.signal;
  const onProgress = args.onProgress;
  const backupToDrive = args.backupToDrive ?? true;

  abortIfNeeded(signal);

  onProgress?.({ phase: "decks", message: "Loading decks…" });
  const decks = await backend.fetchUserDecks({}, { signal });
  abortIfNeeded(signal);

  const deckList = Array.isArray(decks) ? (decks as Deck[]) : [];
  onProgress?.({ phase: "decks", loaded: 1, total: 1, message: `Found ${deckList.length} decks` });

  onProgress?.({ phase: "pairs", loaded: 0, total: deckList.length, message: "Listing deck vocabulary…" });
  const pairSet = new Set<string>();

  for (let i = 0; i < deckList.length; i += 1) {
    abortIfNeeded(signal);
    const deck = deckList[i];
    const deckId = deck?.id;
    if (!deckId) continue;

    const pairs = await backend.listDeckVocabulary(deckId, { signal });
    for (const p of pairs as any[]) {
      const vid = Number((p as any)?.[0]);
      const sid = Number((p as any)?.[1]);
      if (!Number.isFinite(vid) || !Number.isFinite(sid)) continue;
      pairSet.add(`${vid}/${sid}`);
    }

    onProgress?.({
      phase: "pairs",
      loaded: i + 1,
      total: deckList.length,
      message: `Loaded ${pairSet.size.toLocaleString()} unique pairs`,
    });
  }

  abortIfNeeded(signal);

  const pairs: Array<[number, number]> = Array.from(pairSet).map((id) => {
    const [a, b] = id.split("/");
    return [Number(a), Number(b)];
  });

  const fields = ["spelling", "reading", "meanings", "frequency_rank", "card_state", "due_at"];
  const batchSize = 400;

  onProgress?.({ phase: "lookup", loaded: 0, total: pairs.length, message: "Looking up vocabulary…" });

  const allEntries: Array<Record<string, unknown> & { vid: number; sid: number }> = [];
  for (let i = 0; i < pairs.length; i += batchSize) {
    abortIfNeeded(signal);
    const chunkPairs = pairs.slice(i, i + batchSize);

    const entries = await backend.lookupVocabulary(chunkPairs, fields, { signal });
    for (const e of entries as any[]) {
      if (e && typeof e === "object") allEntries.push(e as any);
    }

    onProgress?.({
      phase: "lookup",
      loaded: Math.min(i + batchSize, pairs.length),
      total: pairs.length,
      message: `Looked up ${Math.min(i + batchSize, pairs.length).toLocaleString()} / ${pairs.length.toLocaleString()}`,
    });

    // Keep spikes down; backend also does a small sleep between JPDB chunks.
    if (i + batchSize < pairs.length) {
      await sleep(200, signal);
    }
  }

  abortIfNeeded(signal);

  const updatedAtMs = nowMs();
  const knownRecords: JpdbKnownVocabRecord[] = [];

  for (const entry of allEntries) {
    const vid = Number(entry.vid);
    const sid = Number(entry.sid);
    if (!Number.isFinite(vid) || !Number.isFinite(sid)) continue;

    const cardState = normalizeCardState((entry as any).card_state);
    if (!isKnownState(cardState)) continue;

    const spellingRaw = (entry as any).spelling;
    const spelling = typeof spellingRaw === "string" ? spellingRaw : "";
    if (!spelling) continue;

    const readingRaw = (entry as any).reading;
    const reading = typeof readingRaw === "string" && readingRaw.trim() ? readingRaw : undefined;

    const meanings = normalizeMeanings((entry as any).meanings);
    const frequencyRankRaw = (entry as any).frequency_rank;
    const frequencyRank =
      typeof frequencyRankRaw === "number" && Number.isFinite(frequencyRankRaw)
        ? frequencyRankRaw
        : null;

    const dueAtMs = normalizeDueAtMs((entry as any).due_at);

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

  onProgress?.({ phase: "index", message: "Building English gloss index…" });
  const builtAtMs = nowMs();
  const glossIndexRows = buildGlossIndexRows(knownRecords, builtAtMs);

  const meta: JpdbMirrorMeta = {
    version: 1,
    syncedAtMs: builtAtMs,
    knownEntryCount: knownRecords.length,
    sourceDecks: deckList.map((d) => ({ id: String(d.id), name: String(d.name), words: (d as any).words ?? null })),
  };

  onProgress?.({ phase: "save", message: "Saving mirror…" });
  await writeMirrorSnapshot({ meta, knownVocab: knownRecords, glossIndexRows });

  if (backupToDrive && drive?.isSignedIn()) {
    onProgress?.({ phase: "backup", message: "Backing up mirror to Google Drive…" });
    const snapshot = {
      version: 1,
      syncedAtMs: meta.syncedAtMs,
      sourceDecks: meta.sourceDecks,
      knownVocab: knownRecords.map(({ updatedAtMs, ...rest }) => rest),
    };

    // Only attempt backup if mirror exists locally (avoid writing empty snapshots).
    const existing = await getMirrorMeta();
    if (existing) {
      await drive.saveJpdbMirror(snapshot);
    }
  }
}

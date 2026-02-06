import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { JpdbGlossIndexRow, JpdbKnownVocabRecord, JpdbMirrorMeta } from "./types";

export const JPDB_MIRROR_DB_NAME = "progressive-reader-db";
export const JPDB_MIRROR_DB_VERSION = 1;

interface ProgressiveReaderDbSchema extends DBSchema {
  jpdbMirrorMeta: {
    key: "meta";
    value: JpdbMirrorMeta;
  };
  jpdbKnownVocab: {
    key: string;
    value: JpdbKnownVocabRecord;
  };
  jpdbEnGlossIndex: {
    key: string;
    value: JpdbGlossIndexRow;
  };
}

let dbPromise: Promise<IDBPDatabase<ProgressiveReaderDbSchema>> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

export function getJpdbMirrorDb(): Promise<IDBPDatabase<ProgressiveReaderDbSchema>> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }
  if (!dbPromise) {
    dbPromise = openDB<ProgressiveReaderDbSchema>(
      JPDB_MIRROR_DB_NAME,
      JPDB_MIRROR_DB_VERSION,
      {
        upgrade(db) {
          if (!db.objectStoreNames.contains("jpdbMirrorMeta")) {
            db.createObjectStore("jpdbMirrorMeta");
          }
          if (!db.objectStoreNames.contains("jpdbKnownVocab")) {
            db.createObjectStore("jpdbKnownVocab", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("jpdbEnGlossIndex")) {
            db.createObjectStore("jpdbEnGlossIndex", { keyPath: "gloss" });
          }
        },
      }
    );
  }
  return dbPromise;
}

export async function getMirrorMeta(): Promise<JpdbMirrorMeta | null> {
  if (!hasIndexedDb()) return null;
  const db = await getJpdbMirrorDb();
  return (await db.get("jpdbMirrorMeta", "meta")) ?? null;
}

export async function getAllKnownVocab(): Promise<JpdbKnownVocabRecord[]> {
  if (!hasIndexedDb()) return [];
  const db = await getJpdbMirrorDb();
  return await db.getAll("jpdbKnownVocab");
}

export async function getKnownVocabAsMap(): Promise<Map<string, JpdbKnownVocabRecord>> {
  const records = await getAllKnownVocab();
  const map = new Map<string, JpdbKnownVocabRecord>();
  for (const r of records) map.set(r.id, r);
  return map;
}

export async function getGlossIndexAsMap(): Promise<Map<string, string[]>> {
  if (!hasIndexedDb()) return new Map();
  const db = await getJpdbMirrorDb();
  const rows = await db.getAll("jpdbEnGlossIndex");
  const map = new Map<string, string[]>();
  for (const row of rows) {
    map.set(row.gloss, row.candidateIds);
  }
  return map;
}

export async function writeMirrorSnapshot(args: {
  meta: JpdbMirrorMeta;
  knownVocab: JpdbKnownVocabRecord[];
  glossIndexRows: JpdbGlossIndexRow[];
}): Promise<void> {
  if (!hasIndexedDb()) {
    throw new Error("IndexedDB is not available; cannot persist JPDB mirror.");
  }
  const db = await getJpdbMirrorDb();
  const tx = db.transaction(
    ["jpdbMirrorMeta", "jpdbKnownVocab", "jpdbEnGlossIndex"],
    "readwrite"
  );

  await Promise.all([
    tx.objectStore("jpdbKnownVocab").clear(),
    tx.objectStore("jpdbEnGlossIndex").clear(),
  ]);

  tx.objectStore("jpdbMirrorMeta").put(args.meta, "meta");

  for (const r of args.knownVocab) {
    tx.objectStore("jpdbKnownVocab").put(r);
  }

  for (const row of args.glossIndexRows) {
    tx.objectStore("jpdbEnGlossIndex").put(row);
  }

  await tx.done;
}

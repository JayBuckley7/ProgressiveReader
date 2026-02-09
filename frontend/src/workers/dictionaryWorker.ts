// Background dictionary work (zip parsing + term lookups) off the main thread.

import { TextWriter, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";

export type WorkerMessage =
  | { id: string; type: "LOAD_DICTIONARY"; payload: { arrayBuffer: ArrayBuffer } }
  | { id: string; type: "BUILD_INDEX" }
  | { id: string; type: "LOOKUP_TERM"; payload: { term: string } }
  | { id: string; type: "LOOKUP_BATCH"; payload: { terms: string[] } };

export type WorkerResponse =
  | { id: string; type: "SUCCESS"; payload?: unknown }
  | { id: string; type: "ERROR"; error: string }
  | { id: string; type: "PROGRESS"; payload: ProgressPayload };

export type ProgressPayload = {
  stage: string;
  progress: number;
  processedFiles?: number;
  totalFiles?: number;
  totalEntries?: number;
  totalTerms?: number;
  indexedFiles?: number;
};

type DictionaryEntry = {
  id: string;
  term: string;
  reading: string;
  definitionTags: unknown[];
  rules: unknown[];
  frequency: number;
  definitions: unknown[];
  sourceFile: string;
};

type ZipEntryLike = {
  filename: string;
  getData?: (writer: TextWriter) => Promise<string>;
};

type TermBankRow = [
  expression: string,
  reading: string | null,
  definitionTags?: unknown[],
  rules?: unknown[],
  frequency?: number,
  definitions?: unknown[],
];

let termIndex: Map<string, string[]> | null = null; // term -> entry IDs
let entryCache: Map<string, DictionaryEntry> | null = null; // entry ID -> entry
let zipEntries: ZipEntryLike[] | null = null;
let isIndexed = false;

function parseJson<T = unknown>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error("Invalid JSON format");
  }
}

async function getDictionaryArchiveEntries(data: ArrayBuffer): Promise<ZipEntryLike[]> {
  const zipFileReader = new Uint8ArrayReader(new Uint8Array(data));
  const zipReader = new ZipReader(zipFileReader);
  return (await zipReader.getEntries()) as unknown as ZipEntryLike[];
}

async function readArchiveEntryDataString(entry: ZipEntryLike): Promise<string> {
  if (!entry.getData) throw new Error("Cannot get entry data");
  return await entry.getData(new TextWriter());
}

async function readArchiveEntryDataJson<T = unknown>(entry: ZipEntryLike): Promise<T> {
  return parseJson<T>(await readArchiveEntryDataString(entry));
}

async function buildOptimizedIndex(): Promise<void> {
  if (!zipEntries) throw new Error("Dictionary not loaded");

  postMessage({ id: "build-index", type: "PROGRESS", payload: { stage: "starting", progress: 0 } } satisfies WorkerResponse);

  termIndex = new Map();
  entryCache = new Map();

  const termBankFiles = zipEntries.filter((e) => /^term_bank_\d+\.json$/.test(e.filename));
  termBankFiles.sort((a, b) => {
    const aNum = Number(a.filename.match(/\d+/)?.[0] || 0);
    const bNum = Number(b.filename.match(/\d+/)?.[0] || 0);
    return aNum - bNum;
  });

  let processedFiles = 0;
  let totalEntries = 0;

  for (const termBankEntry of termBankFiles) {
    try {
      const termBankData = await readArchiveEntryDataJson<TermBankRow[]>(termBankEntry);
      for (let i = 0; i < termBankData.length; i++) {
        const row = termBankData[i];
        const expression = String(row[0] ?? "");
        if (!expression) continue;

        const reading = row[1] ? String(row[1]) : "";
        const entryId = `${expression}:${reading}:${termBankEntry.filename}:${i}`;

        const processedEntry: DictionaryEntry = {
          id: entryId,
          term: expression,
          reading: reading || expression,
          definitionTags: Array.isArray(row[2]) ? row[2] : [],
          rules: Array.isArray(row[3]) ? row[3] : [],
          frequency: typeof row[4] === "number" ? row[4] : 0,
          definitions: Array.isArray(row[5]) ? row[5] : [],
          sourceFile: termBankEntry.filename,
        };

        entryCache.set(entryId, processedEntry);

        const byTerm = termIndex.get(expression) ?? [];
        byTerm.push(entryId);
        termIndex.set(expression, byTerm);

        if (reading && reading !== expression) {
          const byReading = termIndex.get(reading) ?? [];
          byReading.push(entryId);
          termIndex.set(reading, byReading);
        }

        totalEntries++;
      }

      processedFiles++;

      const progress = termBankFiles.length ? (processedFiles / termBankFiles.length) * 100 : 100;
      postMessage(
        {
          id: "build-index",
          type: "PROGRESS",
          payload: {
            stage: "processing",
            progress,
            processedFiles,
            totalFiles: termBankFiles.length,
            totalEntries,
          },
        } satisfies WorkerResponse,
      );
    } catch {
      // Skip corrupt/unknown term bank files (best-effort indexing).
    }
  }

  isIndexed = true;

  postMessage(
    {
      id: "build-index",
      type: "SUCCESS",
      payload: {
        stage: "complete",
        progress: 100,
        totalEntries,
        totalTerms: termIndex.size,
        indexedFiles: processedFiles,
      },
    } satisfies WorkerResponse,
  );
}

function lookupTerm(term: string): DictionaryEntry[] {
  if (!isIndexed || !termIndex || !entryCache) throw new Error("Dictionary index not built");
  const entryIds = termIndex.get(term) || [];
  const results: DictionaryEntry[] = [];
  for (const entryId of entryIds) {
    const entry = entryCache.get(entryId);
    if (entry) results.push(entry);
  }
  return results;
}

function lookupTermsBatch(terms: string[]): Record<string, DictionaryEntry[]> {
  const results: Record<string, DictionaryEntry[]> = {};
  for (const term of terms) results[term] = lookupTerm(term);
  return results;
}

async function loadDictionary(arrayBuffer: ArrayBuffer): Promise<void> {
  zipEntries = await getDictionaryArchiveEntries(arrayBuffer);
  postMessage(
    {
      id: "load-dictionary",
      type: "SUCCESS",
      payload: { loaded: true, totalFiles: zipEntries.length },
    } satisfies WorkerResponse,
  );
}

self.onmessage = async (event: MessageEvent) => {
  const message = event.data as WorkerMessage;

  try {
    switch (message.type) {
      case "LOAD_DICTIONARY":
        await loadDictionary(message.payload.arrayBuffer);
        return;

      case "BUILD_INDEX":
        await buildOptimizedIndex();
        return;

      case "LOOKUP_TERM":
        postMessage({ id: message.id, type: "SUCCESS", payload: { results: lookupTerm(message.payload.term) } } satisfies WorkerResponse);
        return;

      case "LOOKUP_BATCH":
        postMessage(
          { id: message.id, type: "SUCCESS", payload: { results: lookupTermsBatch(message.payload.terms) } } satisfies WorkerResponse,
        );
        return;
    }
  } catch (e) {
    postMessage({ id: message.id, type: "ERROR", error: e instanceof Error ? e.message : "Unknown error" } satisfies WorkerResponse);
  }
};

export {}; // Make this a module

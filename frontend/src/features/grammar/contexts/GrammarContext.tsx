import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useAppData } from "@shared/contexts/AppDataContext";
import { bookMetadataService } from "@features/books/services/bookMetadata";
import { toast } from "sonner";

import { getGrammarPointById } from "@features/grammar/data/grammarCatalog";
import type { GrammarPoint } from "@features/grammar/data/grammarCatalog";
import type { GrammarExample, GrammarScanBoundary, GrammarScanState, GrammarStateV2 } from "@features/grammar/types";
import { mergeAndLimitExamples } from "@features/grammar/services/grammarExamples";
import { loadGrammarStateV2FromLocalStorage, saveGrammarStateV2ToLocalStorage } from "@features/grammar/services/grammarStateStorage";
import { mineLibraryForGrammarExamples } from "@features/grammar/services/grammarLibraryMiner";

type GrammarContextValue = {
  state: GrammarStateV2;
  knownSet: ReadonlySet<string>;
  learningSet: ReadonlySet<string>;
  getGrammarPoint: (id: string) => GrammarPoint | null;
  getExamples: (grammarId: string) => GrammarExample[];
  getScanState: (grammarId: string) => GrammarScanState | null;
  setKnown: (grammarId: string, known: boolean) => void;
  setKnownMany: (grammarIds: string[], known: boolean) => void;
  setLearning: (grammarId: string, learning: boolean) => void;
  forceMine: (grammarId: string) => void;
  miningEnabled: boolean;
  underlinesEnabled: boolean;
  setMiningEnabled: (enabled: boolean) => void;
  setUnderlinesEnabled: (enabled: boolean) => void;
};

const GrammarContext = createContext<GrammarContextValue | undefined>(undefined);

const DRIVE_RETRY_BACKOFF_MS = 60_000;

let cachedDriveState: { knownIds: string[]; learningIds: string[]; examplesByGrammarId: Record<string, GrammarExample[]> } | null =
  null;
let driveLoadPromise:
  | Promise<{ knownIds: string[]; learningIds: string[]; examplesByGrammarId: Record<string, GrammarExample[]> } | null>
  | null = null;
let driveLastAttemptAtMs: number | null = null;

function toUniqueSorted(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort();
}

function boundaryAdvances(prev: GrammarScanBoundary | undefined, next: GrammarScanBoundary): boolean {
  if (!prev) return true;
  if (next.uptoChapter > prev.uptoChapter) return true;
  if (next.uptoChapter < prev.uptoChapter) return false;
  const prevP = typeof prev.uptoPercent === "number" ? prev.uptoPercent : 1;
  const nextP = typeof next.uptoPercent === "number" ? next.uptoPercent : 1;
  return nextP > prevP + 1e-6;
}

function boundaryFromProgress(progress: any): GrammarScanBoundary {
  if (!progress || typeof progress !== "object") return { uptoChapter: 0, uptoPercent: 0.05 };
  const ch = typeof progress.currentChapter === "number" ? progress.currentChapter : 0;
  const scrollTop = typeof progress.currentPosition === "number" ? progress.currentPosition : 0;
  const scrollHeight = typeof progress.scrollHeight === "number" ? progress.scrollHeight : null;
  const viewportHeight = typeof progress.viewportHeight === "number" ? progress.viewportHeight : null;

  let percent = 0.1;
  if (scrollHeight && viewportHeight) {
    const denom = Math.max(1, scrollHeight - viewportHeight);
    percent = Math.max(0, Math.min(1, scrollTop / denom));
  }
  return { uptoChapter: Math.max(0, ch), uptoPercent: percent > 0 ? percent : 0.1 };
}

async function detectDefaultMiningEnabled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const userKey = (localStorage.getItem("openaiKey") || "").trim();
  if (userKey) return true;

  try {
    const res = await fetch("/api/openai_key_configured");
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return Boolean(data?.openai_key_configured ?? data?.openaiKeyConfigured ?? data?.openaiKeyConfigured);
  } catch {
    return false;
  }
}

function getBoolLocalStorage(key: string): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  return raw === "true";
}

function setBoolLocalStorage(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // ignore
  }
}

export function GrammarProvider({ children }: { children: React.ReactNode }) {
  const { user, isSignedIn } = useUser();
  const { books } = useAppData();

  const allowDriveSync =
    isSignedIn &&
    (user?.externalAccounts?.some((acc) => String((acc as any)?.provider || "").startsWith("google")) ?? false);

  const [state, setState] = useState<GrammarStateV2>(() => loadGrammarStateV2FromLocalStorage());

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [miningEnabled, setMiningEnabledState] = useState<boolean>(() => getBoolLocalStorage("prGrammarMiningEnabled") ?? false);
  const [underlinesEnabled, setUnderlinesEnabledState] = useState<boolean>(() => getBoolLocalStorage("prGrammarUnderlinesEnabled") ?? false);

  // Initialize defaults for the toggles if not explicitly set.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      const miningStored = getBoolLocalStorage("prGrammarMiningEnabled");
      if (miningStored === null) {
        const enabled = await detectDefaultMiningEnabled();
        if (cancelled) return;
        setMiningEnabledState(enabled);
        setBoolLocalStorage("prGrammarMiningEnabled", enabled);
      }

      const underlineStored = getBoolLocalStorage("prGrammarUnderlinesEnabled");
      if (underlineStored === null) {
        const shouldEnable = getBoolLocalStorage("prGrammarMiningEnabled") ?? miningEnabled;
        if (cancelled) return;
        setUnderlinesEnabledState(Boolean(shouldEnable));
        setBoolLocalStorage("prGrammarUnderlinesEnabled", Boolean(shouldEnable));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMiningEnabled = useCallback((enabled: boolean) => {
    setMiningEnabledState(enabled);
    setBoolLocalStorage("prGrammarMiningEnabled", enabled);
    // If a user enables mining, default underlines on unless explicitly set.
    if (getBoolLocalStorage("prGrammarUnderlinesEnabled") === null && enabled) {
      setUnderlinesEnabledState(true);
      setBoolLocalStorage("prGrammarUnderlinesEnabled", true);
    }
  }, []);

  const setUnderlinesEnabled = useCallback((enabled: boolean) => {
    setUnderlinesEnabledState(enabled);
    setBoolLocalStorage("prGrammarUnderlinesEnabled", enabled);
  }, []);

  const knownSet = useMemo(() => new Set(state.knownIds), [state.knownIds]);
  const learningSet = useMemo(() => new Set(state.learningIds), [state.learningIds]);

  const getGrammarPoint = useCallback((id: string) => getGrammarPointById(id), []);

  const getExamples = useCallback((grammarId: string) => state.examplesByGrammarId[grammarId] || [], [state.examplesByGrammarId]);

  const getScanState = useCallback(
    (grammarId: string) => state.scanByGrammarId?.[grammarId] || null,
    [state.scanByGrammarId]
  );

  const persistLocal = useCallback((next: GrammarStateV2) => {
    saveGrammarStateV2ToLocalStorage(next);
  }, []);

  // Local storage persistence
  useEffect(() => {
    persistLocal(state);
  }, [persistLocal, state]);

  // Drive load merge
  useEffect(() => {
    if (!allowDriveSync) return;

    let cancelled = false;
    const mergeFromDrive = (drive: { knownIds: string[]; learningIds: string[]; examplesByGrammarId: Record<string, GrammarExample[]> }) => {
      if (cancelled) return;
      setState((prev) => {
        const mergedKnown = toUniqueSorted([...prev.knownIds, ...(drive.knownIds || [])]);

        // Remove anything that is known from learning.
        const mergedLearningRaw = toUniqueSorted([...prev.learningIds, ...(drive.learningIds || [])]);
        const mergedLearning = mergedLearningRaw.filter((id) => !mergedKnown.includes(id));

        const mergedExamples: Record<string, GrammarExample[]> = { ...(prev.examplesByGrammarId || {}) };
        for (const [gid, driveExamples] of Object.entries(drive.examplesByGrammarId || {})) {
          mergedExamples[gid] = mergeAndLimitExamples(mergedExamples[gid] || [], driveExamples || [], 3);
        }

        return {
          ...prev,
          knownIds: mergedKnown,
          learningIds: mergedLearning,
          examplesByGrammarId: mergedExamples,
          lastUpdatedMs: Date.now(),
        };
      });
    };

    if (cachedDriveState) {
      mergeFromDrive(cachedDriveState);
      return () => {
        cancelled = true;
      };
    }

    const now = Date.now();
    if (driveLastAttemptAtMs !== null && now - driveLastAttemptAtMs < DRIVE_RETRY_BACKOFF_MS) {
      return () => {
        cancelled = true;
      };
    }

    if (!driveLoadPromise) {
      driveLastAttemptAtMs = now;
      driveLoadPromise = bookMetadataService
        .loadGrammarStateV2()
        .then((drive) => {
          if (!drive) return null;
          cachedDriveState = drive;
          return drive;
        })
        .catch(() => null)
        .finally(() => {
          driveLoadPromise = null;
        });
    }

    driveLoadPromise.then((drive) => {
      if (!drive) return;
      mergeFromDrive(drive);
    });

    return () => {
      cancelled = true;
    };
  }, [allowDriveSync]);

  // Drive save debounce
  const driveSaveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (!allowDriveSync) return;
    if (driveSaveTimeoutRef.current !== null) window.clearTimeout(driveSaveTimeoutRef.current);

    const payload = {
      knownIds: state.knownIds,
      learningIds: state.learningIds,
      examplesByGrammarId: state.examplesByGrammarId,
    };

    driveSaveTimeoutRef.current = window.setTimeout(() => {
      driveSaveTimeoutRef.current = null;
      void bookMetadataService.saveGrammarStateV2(payload).catch(() => {
        // ignore save errors
      });
    }, 800);

    return () => {
      if (driveSaveTimeoutRef.current !== null) window.clearTimeout(driveSaveTimeoutRef.current);
    };
  }, [allowDriveSync, state.knownIds, state.learningIds, state.examplesByGrammarId]);

  const setKnown = useCallback((grammarId: string, known: boolean) => {
    setState((prev) => {
      const knownSetNext = new Set(prev.knownIds);
      if (known) knownSetNext.add(grammarId);
      else knownSetNext.delete(grammarId);

      const knownIds = Array.from(knownSetNext);
      const learningIds = prev.learningIds.filter((id) => !knownSetNext.has(id));

      return {
        ...prev,
        knownIds,
        learningIds,
        lastUpdatedMs: Date.now(),
      };
    });
  }, []);

  const setKnownMany = useCallback((grammarIds: string[], known: boolean) => {
    const ids = (grammarIds || []).filter((x) => typeof x === "string" && x.trim().length > 0);
    if (ids.length === 0) return;

    setState((prev) => {
      const knownSetNext = new Set(prev.knownIds);
      for (const id of ids) {
        if (known) knownSetNext.add(id);
        else knownSetNext.delete(id);
      }

      const knownIds = Array.from(knownSetNext);
      const learningIds = prev.learningIds.filter((id) => !knownSetNext.has(id));

      return {
        ...prev,
        knownIds,
        learningIds,
        lastUpdatedMs: Date.now(),
      };
    });
  }, []);

  const setLearning = useCallback((grammarId: string, learning: boolean) => {
    setState((prev) => {
      const isKnown = prev.knownIds.includes(grammarId);
      const learningSetNext = new Set(prev.learningIds);
      if (learning && !isKnown) learningSetNext.add(grammarId);
      if (!learning) learningSetNext.delete(grammarId);

      const nextScanBy = { ...(prev.scanByGrammarId || {}) };
      if (learning) {
        const cur = nextScanBy[grammarId];
        nextScanBy[grammarId] = {
          ...(cur || {}),
          status: "queued",
        };
      }

      return {
        ...prev,
        learningIds: Array.from(learningSetNext),
        scanByGrammarId: nextScanBy,
        lastUpdatedMs: Date.now(),
      };
    });
  }, []);

  const forceMine = useCallback((grammarId: string) => {
    setState((prev) => {
      const nextScanBy = { ...(prev.scanByGrammarId || {}) };
      const cur = nextScanBy[grammarId];
      nextScanBy[grammarId] = {
        ...(cur || {}),
        status: "queued",
        lastError: undefined,
      };
      return { ...prev, scanByGrammarId: nextScanBy, lastUpdatedMs: Date.now() };
    });
  }, []);

  // Requeue mining when reading progress advances beyond what we scanned.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const bookId = String(detail.bookId || "");
      if (!bookId) return;
      const progress = detail.progress;
      const nextBoundary = boundaryFromProgress(progress);

      const current = stateRef.current;
      const scanBy = current.scanByGrammarId || {};

      const toQueue: string[] = [];
      for (const gid of current.learningIds) {
        const scan = scanBy[gid];
        if (!scan || scan.status !== "not_found_yet") continue;
        const prevBoundary = scan.scannedBoundaries?.[bookId];
        if (!prevBoundary) continue;
        if (!boundaryAdvances(prevBoundary, nextBoundary)) continue;

        const point = getGrammarPointById(gid);
        if (!point || point.hintQuality !== "ok") continue;
        const exCount = (current.examplesByGrammarId[gid] || []).length;
        if (exCount >= 3) continue;

        toQueue.push(gid);
      }

      if (!toQueue.length) return;
      setState((prev) => {
        const nextScanBy = { ...(prev.scanByGrammarId || {}) };
        for (const gid of toQueue) {
          const cur = nextScanBy[gid];
          nextScanBy[gid] = { ...(cur || {}), status: "queued" };
        }
        return { ...prev, scanByGrammarId: nextScanBy, lastUpdatedMs: Date.now() };
      });
    };

    window.addEventListener("pr:reading-progress-saved", handler as any);
    return () => window.removeEventListener("pr:reading-progress-saved", handler as any);
  }, []);

  // Background miner (sequential, one grammar point at a time).
  const minerRunningRef = useRef(false);
  const minerAbortRef = useRef<AbortController | null>(null);

  const runMine = useCallback(
    async (grammarId: string) => {
      const point = getGrammarPointById(grammarId);
      if (!point || point.hintQuality !== "ok") {
        setState((prev) => {
          const scanBy = { ...(prev.scanByGrammarId || {}) };
          scanBy[grammarId] = { ...(scanBy[grammarId] || {}), status: "error", lastError: "Grammar point too ambiguous for MVP mining." };
          return { ...prev, scanByGrammarId: scanBy, lastUpdatedMs: Date.now() };
        });
        return;
      }

      minerAbortRef.current?.abort();
      minerAbortRef.current = new AbortController();

      setState((prev) => {
        const scanBy = { ...(prev.scanByGrammarId || {}) };
        scanBy[grammarId] = { ...(scanBy[grammarId] || {}), status: "scanning", lastError: undefined, lastScanAt: new Date().toISOString() };
        return { ...prev, scanByGrammarId: scanBy, lastUpdatedMs: Date.now() };
      });

      try {
        const alreadyScanned = stateRef.current.scanByGrammarId?.[grammarId]?.scannedBoundaries || {};
        const result = await mineLibraryForGrammarExamples({
          grammar: point,
          books,
          alreadyScannedBoundaries: alreadyScanned,
          signal: minerAbortRef.current.signal,
          onProgress: (p) => {
            setState((prev) => {
              const scanBy = { ...(prev.scanByGrammarId || {}) };
              const cur = scanBy[grammarId] || { status: "scanning" };
              scanBy[grammarId] = { ...cur, status: "scanning", progress: p };
              return { ...prev, scanByGrammarId: scanBy };
            });
          },
        });

        setState((prev) => {
          const nextExamples = mergeAndLimitExamples(prev.examplesByGrammarId[grammarId] || [], result.examples, 3);
          const scanBy = { ...(prev.scanByGrammarId || {}) };
          const cur = scanBy[grammarId] || { status: "idle" };

          scanBy[grammarId] = {
            ...cur,
            status: nextExamples.length > 0 ? "complete" : "not_found_yet",
            scannedBoundaries: { ...(cur.scannedBoundaries || {}), ...(result.scannedBoundaries || {}) },
            progress: result.stats,
            lastScanAt: new Date().toISOString(),
          };

          return {
            ...prev,
            examplesByGrammarId: { ...(prev.examplesByGrammarId || {}), [grammarId]: nextExamples },
            scanByGrammarId: scanBy,
            lastUpdatedMs: Date.now(),
          };
        });

        if (result.examples.length > 0) {
          toast.success(`Found grammar example${result.examples.length > 1 ? "s" : ""}: ${point.title}`);
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setState((prev) => {
          const scanBy = { ...(prev.scanByGrammarId || {}) };
          const cur = scanBy[grammarId] || { status: "idle" };
          scanBy[grammarId] = { ...cur, status: "error", lastError: String(e?.message || e || "Unknown error"), lastScanAt: new Date().toISOString() };
          return { ...prev, scanByGrammarId: scanBy, lastUpdatedMs: Date.now() };
        });
      }
    },
    [books]
  );

  useEffect(() => {
    if (!miningEnabled) return;
    if (!books || books.length === 0) return;
    if (minerRunningRef.current) return;

    // Pick the next queued/eligible grammar point.
    const scanBy = state.scanByGrammarId || {};

    const next = state.learningIds.find((gid) => {
      const point = getGrammarPointById(gid);
      if (!point || point.hintQuality !== "ok") return false;
      const exCount = (state.examplesByGrammarId[gid] || []).length;
      if (exCount >= 3) return false;

      const scan = scanBy[gid];
      if (scan?.status === "scanning") return false;
      if (scan?.status === "queued") return true;
      if (!scan) return true;
      if (scan.status === "idle" || scan.status === "not_found_yet") return true;
      return false;
    });

    if (!next) return;

    minerRunningRef.current = true;
    void runMine(next).finally(() => {
      minerRunningRef.current = false;
    });
  }, [books, miningEnabled, runMine, state.examplesByGrammarId, state.learningIds, state.scanByGrammarId]);

  const value: GrammarContextValue = useMemo(
    () => ({
      state,
      knownSet,
      learningSet,
      getGrammarPoint,
      getExamples,
      getScanState,
      setKnown,
      setKnownMany,
      setLearning,
      forceMine,
      miningEnabled,
      underlinesEnabled,
      setMiningEnabled,
      setUnderlinesEnabled,
    }),
    [
      forceMine,
      getExamples,
      getGrammarPoint,
      getScanState,
      knownSet,
      learningSet,
      miningEnabled,
      setKnown,
      setKnownMany,
      setLearning,
      state,
      underlinesEnabled,
      setMiningEnabled,
      setUnderlinesEnabled,
    ]
  );

  return <GrammarContext.Provider value={value}>{children}</GrammarContext.Provider>;
}

export function useGrammar(): GrammarContextValue {
  const ctx = useContext(GrammarContext);
  if (!ctx) throw new Error("useGrammar must be used within a GrammarProvider");
  return ctx;
}

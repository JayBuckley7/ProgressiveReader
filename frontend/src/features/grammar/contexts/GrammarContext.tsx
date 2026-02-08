import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useAppData } from "@shared/contexts/AppDataContext";
import { toast } from "sonner";
import { notifyError } from "@shared/utils/notify";

import { getGrammarPointById } from "@features/grammar/data/grammarCatalog";
import type { GrammarPoint } from "@features/grammar/data/grammarCatalog";
import type { GrammarExample, GrammarScanBoundary, GrammarScanState, GrammarStateV2 } from "@features/grammar/types";
import { mergeAndLimitExamples } from "@features/grammar/services/grammarExamples";
import { loadGrammarStateV2FromLocalStorage, saveGrammarStateV2ToLocalStorage } from "@features/grammar/services/grammarStateStorage";
import { mineLibraryForGrammarExamples } from "@features/grammar/services/grammarLibraryMiner";
import { mergeTeachingIntoExamples, teachGrammarExamples } from "@features/grammar/services/grammarTeachApi";
import { boundaryAdvances, boundaryFromProgress } from "./grammarContext/boundary";
import { useGrammarDriveSync } from "./grammarContext/driveSync";
import { useGrammarMiningToggles } from "./grammarContext/toggles";

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
  teachExamples: (grammarId: string) => Promise<void>;
  runNow: (grammarId: string) => void;
  cancelMining: () => void;
  activeMiningGrammarId: string | null;
  miningEnabled: boolean;
  underlinesEnabled: boolean;
  setMiningEnabled: (enabled: boolean) => void;
  setUnderlinesEnabled: (enabled: boolean) => void;
};

const GrammarContext = createContext<GrammarContextValue | undefined>(undefined);

export function GrammarProvider({ children }: { children: React.ReactNode }) {
  const { user, isSignedIn } = useUser();
  const { books } = useAppData();

  const allowDriveSync =
    isSignedIn &&
    (user?.externalAccounts?.some((acc) => String((acc as { provider?: unknown })?.provider || "").startsWith("google")) ?? false);

  const [state, setState] = useState<GrammarStateV2>(() => loadGrammarStateV2FromLocalStorage());

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { miningEnabled, underlinesEnabled, setMiningEnabled, setUnderlinesEnabled } = useGrammarMiningToggles();
  const [activeMiningGrammarId, setActiveMiningGrammarId] = useState<string | null>(null);

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
  useGrammarDriveSync({ allowDriveSync, userId: user?.id ?? null, state, setState });

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
        const point = getGrammarPointById(grammarId);
        nextScanBy[grammarId] = {
          ...(cur || {}),
          // Don't enqueue auto-mining for ultra-common/ambiguous points.
          status: point && point.hintQuality === "ok" ? "queued" : "idle",
          lastError: undefined,
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
      const point = getGrammarPointById(grammarId);
      nextScanBy[grammarId] = {
        ...(cur || {}),
        status: point && point.hintQuality === "ok" ? "queued" : "error",
        lastError: point && point.hintQuality === "ok" ? undefined : "Grammar point too ambiguous for MVP mining.",
      };
      return { ...prev, scanByGrammarId: nextScanBy, lastUpdatedMs: Date.now() };
    });
  }, []);

  // Background "teacher" (LLM teaching overlay). Keep this separate from mining so we can
  // generate breakdown/usage/contrast once examples exist.
  const teacherRunningRef = useRef(false);
  const autoTeachBlockedRef = useRef<Set<string>>(new Set());

  const teachExamples = useCallback(
    async (grammarId: string) => {
      const point = getGrammarPointById(grammarId);
      if (!point) return;

      const examples = stateRef.current.examplesByGrammarId[grammarId] || [];
      const missing = examples.filter((e) => !e.teaching);
      if (missing.length === 0) return;

      const apiKey = (typeof window !== "undefined" ? (localStorage.getItem("openaiKey") || "") : "") || "";
      const model = (typeof window !== "undefined" ? (localStorage.getItem("openaiModel") || "") : "") || "gpt-4o-mini";

      try {
        const resp = await teachGrammarExamples({
          grammar: { id: point.id, title: point.title, meaning: point.meaning, level: point.level },
          examples: missing.slice(0, 3).map((e) => ({
            exampleId: e.id,
            sentence: e.sentence,
            before: e.before,
            after: e.after,
            matchSpan: e.match ? { start: e.match.start, end: e.match.end, text: e.match.text } : undefined,
          })),
          model,
          apiKey: apiKey || undefined,
        });

        autoTeachBlockedRef.current.delete(grammarId);

        setState((prev) => {
          const cur = prev.examplesByGrammarId[grammarId] || [];
          const merged = mergeTeachingIntoExamples(cur, resp.teachings || [], { model });
          return {
            ...prev,
            examplesByGrammarId: { ...(prev.examplesByGrammarId || {}), [grammarId]: merged },
            lastUpdatedMs: Date.now(),
          };
        });
      } catch (e: unknown) {
        // Prevent background auto-teach from retrying endlessly for this grammarId.
        autoTeachBlockedRef.current.add(grammarId);
        notifyError(e, { title: "Teaching failed" });
      }
    },
    []
  );

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

    window.addEventListener("pr:reading-progress-saved", handler);
    return () => window.removeEventListener("pr:reading-progress-saved", handler);
  }, []);

  // Background miner (sequential, one grammar point at a time).
  const minerRunningRef = useRef(false);
  const minerAbortRef = useRef<AbortController | null>(null);
  const priorityNextGrammarIdRef = useRef<string | null>(null);

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
      setActiveMiningGrammarId(grammarId);

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

          // Kick off teaching immediately so examples land "taught" by default without user action.
          // (Auto-teach effect will also pick this up, but this reduces perceived latency.)
          if (!teacherRunningRef.current) {
            teacherRunningRef.current = true;
            void teachExamples(grammarId).finally(() => {
              teacherRunningRef.current = false;
            });
          }
        }
      } catch (e: unknown) {
        if (e && typeof e === "object" && "name" in e && (e as { name?: unknown }).name === "AbortError") {
          // Ensure aborted jobs do not remain stuck in "scanning".
          setState((prev) => {
            const scanBy = { ...(prev.scanByGrammarId || {}) };
            const cur = scanBy[grammarId] || { status: "idle" };
            scanBy[grammarId] = {
              ...cur,
              status: "queued",
              lastError: "Cancelled",
              lastScanAt: new Date().toISOString(),
            };
            return { ...prev, scanByGrammarId: scanBy, lastUpdatedMs: Date.now() };
          });
          return;
        }
        setState((prev) => {
          const scanBy = { ...(prev.scanByGrammarId || {}) };
          const cur = scanBy[grammarId] || { status: "idle" };
          const message =
            e && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : undefined;
          scanBy[grammarId] = {
            ...cur,
            status: "error",
            lastError: message || String(e || "Unknown error"),
            lastScanAt: new Date().toISOString(),
          };
          return { ...prev, scanByGrammarId: scanBy, lastUpdatedMs: Date.now() };
        });
      } finally {
        setActiveMiningGrammarId(null);
      }
    },
    [books]
  );

  const cancelMining = useCallback(() => {
    minerAbortRef.current?.abort();
    const gid = activeMiningGrammarId;
    if (!gid) return;
    setState((prev) => {
      const scanBy = { ...(prev.scanByGrammarId || {}) };
      const cur = scanBy[gid] || { status: "idle" };
      if (cur.status === "scanning") {
        scanBy[gid] = { ...cur, status: "queued", lastError: "Cancelled", lastScanAt: new Date().toISOString() };
      }
      return { ...prev, scanByGrammarId: scanBy, lastUpdatedMs: Date.now() };
    });
  }, [activeMiningGrammarId]);

  const runNow = useCallback(
    (grammarId: string) => {
      priorityNextGrammarIdRef.current = grammarId;
      // If we're currently scanning something else, abort it so the chosen job can run next.
      if (activeMiningGrammarId && activeMiningGrammarId !== grammarId) {
        minerAbortRef.current?.abort();
      }
      setState((prev) => {
        const nextScanBy = { ...(prev.scanByGrammarId || {}) };
        const cur = nextScanBy[grammarId];
        const point = getGrammarPointById(grammarId);
        nextScanBy[grammarId] = {
          ...(cur || {}),
          status: point && point.hintQuality === "ok" ? "queued" : "error",
          lastError: point && point.hintQuality === "ok" ? undefined : "Grammar point too ambiguous for MVP mining.",
        };
        return { ...prev, scanByGrammarId: nextScanBy, lastUpdatedMs: Date.now() };
      });
    },
    [activeMiningGrammarId]
  );

  useEffect(() => {
    if (!miningEnabled) return;
    if (!books || books.length === 0) return;
    if (minerRunningRef.current) return;

    // Pick the next queued/eligible grammar point.
    const scanBy = state.scanByGrammarId || {};

      const isEligible = (gid: string) => {
        const point = getGrammarPointById(gid);
        if (!point || point.hintQuality !== "ok") return false;
        const exCount = (state.examplesByGrammarId[gid] || []).length;
        if (exCount >= 3) return false;

        const scan = scanBy[gid];
        if (scan?.status === "scanning") return false;
        if (scan?.status === "queued") return true;
        if (!scan) return true; // first time we see this learning point
        if (scan.status === "idle") return true;

        // IMPORTANT: do NOT auto-rerun "not_found_yet" points in a tight loop.
        // These should only be re-queued when reading progress advances (see pr:reading-progress-saved),
        // or via explicit user action (Run now / Find examples).
        return false;
      };

    const forced = priorityNextGrammarIdRef.current;
    let next: string | undefined;
    if (forced && isEligible(forced)) {
      next = forced;
    } else {
      next = state.learningIds.find(isEligible);
    }

    if (!next) return;

    minerRunningRef.current = true;
    void runMine(next).finally(() => {
      minerRunningRef.current = false;
      if (priorityNextGrammarIdRef.current === next) priorityNextGrammarIdRef.current = null;
    });
  }, [books, miningEnabled, runMine, state.examplesByGrammarId, state.learningIds, state.scanByGrammarId]);

  // Auto-generate teaching overlays once examples exist (default experience).
  useEffect(() => {
    if (!miningEnabled) return;
    if (!books || books.length === 0) return;
    if (teacherRunningRef.current) return;

    const next = state.learningIds.find((gid) => {
      if (autoTeachBlockedRef.current.has(gid)) return false;
      const ex = state.examplesByGrammarId[gid] || [];
      if (ex.length === 0) return false;
      if (ex.every((e) => Boolean(e.teaching))) return false;
      return true;
    });
    if (!next) return;

    teacherRunningRef.current = true;
    void teachExamples(next).finally(() => {
      teacherRunningRef.current = false;
    });
  }, [books, miningEnabled, state.examplesByGrammarId, state.learningIds, teachExamples]);

  // Abort in-flight request on unmount.
  useEffect(() => {
    return () => {
      minerAbortRef.current?.abort();
    };
  }, []);

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
      teachExamples,
      runNow,
      cancelMining,
      activeMiningGrammarId,
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
      teachExamples,
      runNow,
      cancelMining,
      activeMiningGrammarId,
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

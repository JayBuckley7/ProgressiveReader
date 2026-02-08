import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";

import type { GrammarExample } from "@features/grammar/types";
import type { GrammarStateV2 } from "@features/grammar/types";
import { mergeAndLimitExamples } from "@features/grammar/services/grammarExamples";
import { toUniqueSorted } from "./boundary";
import { useAppDeps } from "@app/deps/AppDepsProvider";

type DriveGrammarState = {
  knownIds: string[];
  learningIds: string[];
  examplesByGrammarId: Record<string, GrammarExample[]>;
};

const DRIVE_RETRY_BACKOFF_MS = 60_000;

const driveCacheByUserId = new Map<string, DriveGrammarState>();
const driveLoadPromiseByUserId = new Map<string, Promise<DriveGrammarState | null>>();
const driveLastAttemptAtMsByUserId = new Map<string, number>();

function isDriveGrammarState(value: unknown): value is DriveGrammarState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.knownIds) && Array.isArray(v.learningIds) && typeof v.examplesByGrammarId === "object";
}

export function useGrammarDriveSync(params: {
  allowDriveSync: boolean;
  userId: string | null;
  state: GrammarStateV2;
  setState: Dispatch<SetStateAction<GrammarStateV2>>;
}) {
  const deps = useAppDeps();
  const { allowDriveSync, userId, state, setState } = params;

  // Drive load merge (cached per-user to avoid cross-user leakage).
  useEffect(() => {
    if (!allowDriveSync || !userId) return;

    let cancelled = false;

    const mergeFromDrive = (drive: DriveGrammarState) => {
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

    const cached = driveCacheByUserId.get(userId);
    if (cached) {
      mergeFromDrive(cached);
      return () => {
        cancelled = true;
      };
    }

    const now = Date.now();
    const lastAttempt = driveLastAttemptAtMsByUserId.get(userId);
    if (lastAttempt !== undefined && now - lastAttempt < DRIVE_RETRY_BACKOFF_MS) {
      return () => {
        cancelled = true;
      };
    }

    if (!driveLoadPromiseByUserId.has(userId)) {
      driveLastAttemptAtMsByUserId.set(userId, now);
      const p = deps.drive
        .loadGrammarStateV2()
        .then((drive) => {
          if (!isDriveGrammarState(drive)) return null;
          driveCacheByUserId.set(userId, drive);
          return drive;
        })
        .catch(() => null)
        .finally(() => {
          driveLoadPromiseByUserId.delete(userId);
        });
      driveLoadPromiseByUserId.set(userId, p);
    }

    driveLoadPromiseByUserId.get(userId)!.then((drive) => {
      if (!drive) return;
      mergeFromDrive(drive);
    });

    return () => {
      cancelled = true;
    };
  }, [allowDriveSync, setState, userId]);

  // Drive save debounce.
  const driveSaveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (!allowDriveSync || !userId) return;
    if (driveSaveTimeoutRef.current !== null) window.clearTimeout(driveSaveTimeoutRef.current);

    const payload: DriveGrammarState = {
      knownIds: state.knownIds,
      learningIds: state.learningIds,
      examplesByGrammarId: state.examplesByGrammarId,
    };

    driveSaveTimeoutRef.current = window.setTimeout(() => {
      driveSaveTimeoutRef.current = null;
      void deps.drive.saveGrammarStateV2(payload).catch(() => {
        // ignore save errors
      });
    }, 800);

    return () => {
      if (driveSaveTimeoutRef.current !== null) window.clearTimeout(driveSaveTimeoutRef.current);
    };
  }, [allowDriveSync, state.examplesByGrammarId, state.knownIds, state.learningIds, userId]);
}

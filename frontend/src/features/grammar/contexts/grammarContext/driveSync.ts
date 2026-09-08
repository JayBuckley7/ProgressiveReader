import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import type { GrammarStateV2 } from "@features/grammar/types";
import { mergeAndLimitExamples } from "@features/grammar/services/grammarExamples";
import { useAppDeps } from "@app/deps/AppDepsProvider";

type Payload = Pick<GrammarStateV2, "knownIds" | "learningIds" | "examplesByGrammarId">;
const payloadOf = (state: GrammarStateV2): Payload => ({ knownIds: state.knownIds, learningIds: state.learningIds, examplesByGrammarId: state.examplesByGrammarId });

export function useGrammarDriveSync({ allowDriveSync, userId, state, setState }: {
  allowDriveSync: boolean; userId: string | null; state: GrammarStateV2; setState: Dispatch<SetStateAction<GrammarStateV2>>;
}) {
  const deps = useAppDeps();
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("Progress stays on this device. Connect Drive to sync.");
  const lastSaved = useRef("");
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    setReady(false);
    if (!allowDriveSync || !userId) { setStatus("Progress stays on this device. Connect Drive to sync."); return; }
    let cancelled = false;
    setStatus("Loading grammar progress from Drive…");
    void deps.drive.loadGrammarStateV2().then(remote => {
      if (cancelled) return;
      if (!remote || !Array.isArray(remote.knownIds) || !Array.isArray(remote.learningIds) || !remote.examplesByGrammarId) throw new Error("Drive progress could not be read safely.");
      lastSaved.current = JSON.stringify(remote);
      setState(local => {
        const knownIds = [...new Set<string>([...local.knownIds, ...remote.knownIds])];
        const learningIds = [...new Set<string>([...local.learningIds, ...remote.learningIds])].filter(id => !knownIds.includes(id));
        const examplesByGrammarId = { ...local.examplesByGrammarId };
        for (const [id, examples] of Object.entries(remote.examplesByGrammarId)) examplesByGrammarId[id] = mergeAndLimitExamples(examplesByGrammarId[id] || [], examples as any, 3);
        return { ...local, knownIds, learningIds, examplesByGrammarId };
      });
      setReady(true); setStatus("Grammar progress loaded from Drive.");
    }).catch(error => { if (!cancelled) setStatus(`${error instanceof Error ? error.message : "Drive read failed."} Local progress is retained; cloud saves are paused.`); });
    return () => { cancelled = true; };
  }, [allowDriveSync, userId, retry, deps.drive, setState]);

  useEffect(() => {
    if (!ready || !allowDriveSync || !userId) return;
    const payload = payloadOf(state);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSaved.current) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      writes.current = writes.current.then(async () => {
        if (cancelled) return;
        setStatus("Saving grammar progress to Drive…");
        try {
          const result = await deps.drive.saveGrammarStateV2(payload);
          if ((result as unknown) === false) throw new Error("Drive did not confirm the save.");
          if (!cancelled) { lastSaved.current = serialized; setStatus("Grammar progress saved to Drive."); }
        } catch (error) { if (!cancelled) setStatus(`${error instanceof Error ? error.message : "Drive save failed."} Progress is kept on this device. Retry sync when ready.`); }
      });
    }, 800);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [ready, allowDriveSync, userId, state, deps.drive]);
  return { status, retry: () => setRetry(value => value + 1) };
}

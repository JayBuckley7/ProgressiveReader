import type { GrammarStateV2, GrammarScanState } from "@features/grammar/types";
const KEY = "grammar_state_v2";
export const emptyGrammarState = (): GrammarStateV2 => ({ version: 2, knownIds: [], learningIds: [], examplesByGrammarId: {}, scanByGrammarId: {}, lastUpdatedMs: Date.now() });
const keyFor = (owner?: string) => owner ? `${KEY}:${encodeURIComponent(owner)}` : KEY;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");

export function loadGrammarStateV2FromLocalStorage(owner?: string): GrammarStateV2 {
  if (typeof window === "undefined") return emptyGrammarState();
  const raw = localStorage.getItem(keyFor(owner));
  if (!raw) {
    const legacy = owner ? null : localStorage.getItem("grammar_progress_v1");
    if (!legacy) return emptyGrammarState();
    const knownIds = JSON.parse(legacy);
    if (!strings(knownIds)) throw new Error("Legacy grammar progress is unreadable and has been preserved.");
    return { ...emptyGrammarState(), knownIds };
  }
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 2 || !strings(parsed.knownIds) || !strings(parsed.learningIds)
    || !parsed.examplesByGrammarId || typeof parsed.examplesByGrammarId !== "object" || Array.isArray(parsed.examplesByGrammarId)
    || !Object.values(parsed.examplesByGrammarId).every(Array.isArray)) {
    throw new Error("Saved grammar progress is unreadable and has been preserved.");
  }
  const scanByGrammarId: Record<string, GrammarScanState> = {};
  for (const [id, value] of Object.entries(parsed.scanByGrammarId || {})) {
    const scan = value as GrammarScanState;
    if (!scan || typeof scan !== "object") continue;
    scanByGrammarId[id] = scan.status === "scanning" ? { ...scan, status: "paused", lastError: "Interrupted when the page closed. Choose Run now to resume." } : scan;
  }
  return { version: 2, knownIds: [...new Set(parsed.knownIds)] as string[], learningIds: parsed.learningIds.filter((id: string) => !parsed.knownIds.includes(id)),
    examplesByGrammarId: parsed.examplesByGrammarId, scanByGrammarId, lastUpdatedMs: Number(parsed.lastUpdatedMs) || Date.now() };
}

export function saveGrammarStateV2ToLocalStorage(state: GrammarStateV2, owner?: string): void {
  if (typeof window !== "undefined") localStorage.setItem(keyFor(owner), JSON.stringify(state));
}

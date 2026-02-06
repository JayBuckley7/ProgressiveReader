import type { GrammarStateV2 } from "@features/grammar/types";

const GRAMMAR_STATE_V2_KEY = "grammar_state_v2";
const GRAMMAR_PROGRESS_V1_KEY = "grammar_progress_v1";

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x) => typeof x === "string") as string[];
}

export function loadGrammarStateV2FromLocalStorage(): GrammarStateV2 {
  if (typeof window === "undefined") {
    return {
      version: 2,
      knownIds: [],
      learningIds: [],
      examplesByGrammarId: {},
      scanByGrammarId: {},
      lastUpdatedMs: Date.now(),
    };
  }

  try {
    const raw = localStorage.getItem(GRAMMAR_STATE_V2_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 2) {
        return {
          version: 2,
          knownIds: toStringArray(parsed.knownIds),
          learningIds: toStringArray(parsed.learningIds),
          examplesByGrammarId:
            parsed.examplesByGrammarId && typeof parsed.examplesByGrammarId === "object"
              ? (parsed.examplesByGrammarId as Record<string, any>)
              : {},
          scanByGrammarId:
            parsed.scanByGrammarId && typeof parsed.scanByGrammarId === "object"
              ? (parsed.scanByGrammarId as Record<string, any>)
              : {},
          lastUpdatedMs: typeof parsed.lastUpdatedMs === "number" ? parsed.lastUpdatedMs : Date.now(),
        } satisfies GrammarStateV2;
      }
    }
  } catch {
    // ignore parse errors
  }

  // Migrate from v1 (known only) if present.
  try {
    const rawV1 = localStorage.getItem(GRAMMAR_PROGRESS_V1_KEY);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      const knownIds = toStringArray(parsed);
      return {
        version: 2,
        knownIds,
        learningIds: [],
        examplesByGrammarId: {},
        scanByGrammarId: {},
        lastUpdatedMs: Date.now(),
      };
    }
  } catch {
    // ignore migration errors
  }

  return {
    version: 2,
    knownIds: [],
    learningIds: [],
    examplesByGrammarId: {},
    scanByGrammarId: {},
    lastUpdatedMs: Date.now(),
  };
}

export function saveGrammarStateV2ToLocalStorage(state: GrammarStateV2): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GRAMMAR_STATE_V2_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}


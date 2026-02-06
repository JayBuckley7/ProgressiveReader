import type { GrammarExample } from "@features/grammar/types";

export function mergeAndLimitExamples(
  existing: GrammarExample[] | undefined,
  incoming: GrammarExample[] | undefined,
  max: number = 3
): GrammarExample[] {
  const merged = new Map<string, GrammarExample>();
  for (const ex of existing || []) merged.set(ex.id, ex);
  for (const ex of incoming || []) merged.set(ex.id, ex);

  const sorted = Array.from(merged.values()).sort((a, b) => {
    const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (conf !== 0) return conf;
    const at = Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
    if (Number.isFinite(at) && at !== 0) return at;
    return b.id.localeCompare(a.id);
  });

  return sorted.slice(0, Math.max(0, max));
}


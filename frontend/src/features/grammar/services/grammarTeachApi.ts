import type { GrammarExample } from "@features/grammar/types";

export type TeachExampleRequest = {
  grammar: { id: string; title: string; meaning: string; level: string };
  examples: Array<{
    exampleId: string;
    sentence: string;
    before?: string;
    after?: string;
    matchSpan?: { start: number; end: number; text?: string };
  }>;
  model?: string;
  apiKey?: string;
};

export type TeachExampleResponse = {
  teachings: Array<{
    exampleId: string;
    translation?: string | null;
    breakdown?: string | null;
    usageNote?: string | null;
    contrast?: { alternative: string; note: string } | null;
  }>;
};

export async function teachGrammarExamples(
  request: TeachExampleRequest,
  opts?: { signal?: AbortSignal }
): Promise<TeachExampleResponse> {
  const res = await fetch("/api/grammar/teach-examples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: opts?.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as TeachExampleResponse;
}

export function mergeTeachingIntoExamples(
  examples: GrammarExample[],
  teachings: TeachExampleResponse["teachings"],
  meta: { model?: string }
): GrammarExample[] {
  const byId = new Map(teachings.map((t) => [t.exampleId, t]));
  const nowIso = new Date().toISOString();
  return examples.map((ex) => {
    const t = byId.get(ex.id);
    if (!t) return ex;
    return {
      ...ex,
      teaching: {
        translation: typeof t.translation === "string" ? t.translation : undefined,
        breakdown: typeof t.breakdown === "string" ? t.breakdown : undefined,
        usageNote: typeof t.usageNote === "string" ? t.usageNote : undefined,
        contrast:
          t.contrast && typeof t.contrast === "object" && typeof (t.contrast as any).alternative === "string" && typeof (t.contrast as any).note === "string"
            ? { alternative: String((t.contrast as any).alternative), note: String((t.contrast as any).note) }
            : undefined,
        createdAt: nowIso,
        model: meta.model,
      },
    };
  });
}

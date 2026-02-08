import type { GrammarExample } from "@features/grammar/types";
import type { TeachExampleRequest, TeachExampleResponse } from "@core/grammar/teachExamples";
import { teachGrammarExamplesWithLlm } from "@core/grammar/teachExamples";
import type { GrammarBackendPort } from "@core/backend/ports";
import type { LlmChatPort } from "@core/llm/ports";

export async function teachGrammarExamples(
  request: TeachExampleRequest,
  deps: { llm: LlmChatPort; backend: GrammarBackendPort },
  opts?: { signal?: AbortSignal }
): Promise<TeachExampleResponse> {
  const apiKey = (request.apiKey || "").trim();

  // Privacy promise: if the user provides their own key, never send their reading content to the backend.
  if (apiKey) {
    return teachGrammarExamplesWithLlm(request, { llm: deps.llm }, opts);
  }

  const { apiKey: _apiKey, ...fallbackRequest } = request;
  return deps.backend.teachExamples(fallbackRequest, opts);
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

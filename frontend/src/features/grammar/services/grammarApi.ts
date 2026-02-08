import type { GrammarValidateRequest, GrammarValidateResponse } from "@core/grammar/validateCandidates";
import { validateGrammarCandidatesWithLlm } from "@core/grammar/validateCandidates";
import type { LlmChatPort } from "@core/llm/ports";
import type { GrammarBackendPort } from "@core/backend/ports";

export async function validateGrammarCandidates(
  request: GrammarValidateRequest,
  deps: { llm: LlmChatPort; backend: GrammarBackendPort },
  opts?: { signal?: AbortSignal }
): Promise<GrammarValidateResponse> {
  const apiKey = (request.apiKey || "").trim();

  // Privacy promise: if the user provides their own key, never send their reading content to the backend.
  if (apiKey) {
    return validateGrammarCandidatesWithLlm(request, { llm: deps.llm }, opts);
  }

  const { apiKey: _apiKey, ...fallbackRequest } = request;
  return deps.backend.validateExamples(fallbackRequest, opts);
}

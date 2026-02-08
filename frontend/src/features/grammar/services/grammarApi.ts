import type { GrammarValidateRequest, GrammarValidateResponse } from "@core/grammar/validateCandidates";
import { validateGrammarCandidatesWithLlm } from "@core/grammar/validateCandidates";
import { browserOpenAiChatPort } from "@integrations/openai/browserChat";
import { validateGrammarCandidatesViaBackend } from "@integrations/backend/grammar";

export async function validateGrammarCandidates(
  request: GrammarValidateRequest,
  opts?: { signal?: AbortSignal }
): Promise<GrammarValidateResponse> {
  const apiKey = (request.apiKey || "").trim();

  // Privacy promise: if the user provides their own key, never send their reading content to the backend.
  if (apiKey) {
    return validateGrammarCandidatesWithLlm(request, { llm: browserOpenAiChatPort }, opts);
  }

  const { apiKey: _apiKey, ...fallbackRequest } = request;
  return validateGrammarCandidatesViaBackend(fallbackRequest, opts);
}

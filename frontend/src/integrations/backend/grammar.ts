import type { GrammarValidateRequest, GrammarValidateResponse } from "@core/grammar/validateCandidates";
import type { TeachExampleRequest, TeachExampleResponse } from "@core/grammar/teachExamples";

export async function validateGrammarCandidatesViaBackend(
  request: Omit<GrammarValidateRequest, "apiKey">,
  opts?: { signal?: AbortSignal }
): Promise<GrammarValidateResponse> {
  const res = await fetch("/api/grammar/validate-examples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: opts?.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as GrammarValidateResponse;
}

export async function teachGrammarExamplesViaBackend(
  request: Omit<TeachExampleRequest, "apiKey">,
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


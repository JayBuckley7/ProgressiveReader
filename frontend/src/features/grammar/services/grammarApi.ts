export type GrammarValidateSpan = {
  start: number;
  end: number;
  text?: string;
};

export type GrammarValidateCandidate = {
  id: string;
  sentence: string;
  before?: string;
  after?: string;
  hintSpan?: GrammarValidateSpan;
};

export type GrammarValidateRequest = {
  grammar: { id: string; title: string; meaning: string; level: string };
  candidates: GrammarValidateCandidate[];
  maxResults?: number;
  model?: string;
  apiKey?: string;
};

export type GrammarValidateMatch = {
  candidateId: string;
  isMatch: boolean;
  confidence?: number;
  matchSpan?: { start: number; end: number; text?: string } | null;
  explanation?: string | null;
};

export type GrammarValidateResponse = {
  matches: GrammarValidateMatch[];
};

export async function validateGrammarCandidates(
  request: GrammarValidateRequest,
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


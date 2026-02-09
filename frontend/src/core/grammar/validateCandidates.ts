import type { LlmChatPort } from "@core/llm/ports";
import { isRecord, parseJsonLoose } from "@core/utils/json";

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

export async function validateGrammarCandidatesWithLlm(
  request: GrammarValidateRequest,
  deps: { llm: LlmChatPort },
  opts?: { signal?: AbortSignal }
): Promise<GrammarValidateResponse> {
  const apiKey = (request.apiKey || "").trim();
  if (!apiKey) throw new Error("Missing OpenAI API key");

  const model = (request.model || "gpt-4o-mini").trim() || "gpt-4o-mini";
  const maxResults = Math.max(1, Math.min(3, request.maxResults ?? 3));

  const systemPrompt =
    "You are a strict Japanese grammar validator.\n" +
    "Given a grammar point and candidate sentences, decide whether the grammar point is actually used.\n" +
    "IMPORTANT: Treat grammar.meaning as the authoritative target sense. If the surface form appears but the\n" +
    "sentence uses a different sense/usage than grammar.meaning, you MUST set isMatch=false.\n" +
    "Return ONLY valid JSON with this exact shape:\n" +
    '{ "matches": [ { "candidateId": string, "isMatch": boolean, "confidence": number, ' +
    '"matchSpan": {"start": number, "end": number, "text": string} | null, ' +
    '"explanation": string | null } ] }\n' +
    "Rules:\n" +
    "- confidence is 0..1.\n" +
    "- matchSpan.start/end are indices into candidate.sentence (JS string indices).\n" +
    "- matchSpan.text must equal sentence[start:end].\n" +
    "- Keep explanation <= 25 words.\n" +
    "- If not a match, set matchSpan null.\n" +
    "- Set isMatch=true for at most maxResults candidates total.\n" +
    "- Be conservative with polysemous/common items; prefer false if uncertain.\n";

  const userPayload = {
    grammar: request.grammar,
    candidates: (request.candidates || []).map((c) => ({
      id: c.id,
      sentence: c.sentence,
      before: c.before,
      after: c.after,
      hintSpan: c.hintSpan ?? null,
    })),
    maxResults,
    instructions:
      "Evaluate each candidate. Output one matches entry per candidate id.\n" +
      "Sort matches so that the best true matches come first (highest confidence).\n" +
      "Only mark up to maxResults candidates as isMatch=true.\n" +
      "If you are unsure OR the usage doesn't match grammar.meaning, mark isMatch=false with low confidence.\n",
  };

  const completion = await deps.llm.createChatCompletion({
    apiKey,
    body: {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    },
    signal: opts?.signal,
  });

  const parsed = parseJsonLoose(completion.content) as any;
  const rawMatches = parsed?.matches;
  if (!Array.isArray(rawMatches)) return { matches: [] };

  const matches: GrammarValidateMatch[] = [];
  for (const row of rawMatches) {
    if (!isRecord(row)) continue;
    const candidateId = row.candidateId;
    if (typeof candidateId !== "string" || !candidateId) continue;

    const isMatch = Boolean(row.isMatch);

    let confidence: number | undefined = undefined;
    if (typeof row.confidence === "number" && Number.isFinite(row.confidence)) {
      confidence = Math.max(0, Math.min(1, row.confidence));
    }

    let matchSpan: GrammarValidateMatch["matchSpan"] = null;
    if (isMatch && isRecord(row.matchSpan)) {
      const start = row.matchSpan.start;
      const end = row.matchSpan.end;
      const text = row.matchSpan.text;
      if (typeof start === "number" && typeof end === "number" && Number.isFinite(start) && Number.isFinite(end)) {
        matchSpan = {
          start: Math.max(0, Math.floor(start)),
          end: Math.max(0, Math.floor(end)),
          ...(typeof text === "string" && text ? { text } : {}),
        };
      }
    }

    const explanation = typeof row.explanation === "string" ? row.explanation : null;
    matches.push({ candidateId, isMatch, confidence, matchSpan, explanation });
  }

  matches.sort((a, b) => {
    const aScore = (a.isMatch ? 1 : 0) * 10 + (typeof a.confidence === "number" ? a.confidence : 0);
    const bScore = (b.isMatch ? 1 : 0) * 10 + (typeof b.confidence === "number" ? b.confidence : 0);
    return bScore - aScore;
  });

  // Enforce maxResults at the boundary, regardless of model compliance.
  let trueCount = 0;
  for (const m of matches) {
    if (!m.isMatch) continue;
    trueCount += 1;
    if (trueCount > maxResults) {
      m.isMatch = false;
      m.matchSpan = null;
    }
  }

  return { matches };
}

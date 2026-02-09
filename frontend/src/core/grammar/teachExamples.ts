import type { LlmChatPort } from "@core/llm/ports";
import { isRecord, parseJsonLoose } from "@core/utils/json";

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

export async function teachGrammarExamplesWithLlm(
  request: TeachExampleRequest,
  deps: { llm: LlmChatPort },
  opts?: { signal?: AbortSignal }
): Promise<TeachExampleResponse> {
  const apiKey = (request.apiKey || "").trim();
  if (!apiKey) throw new Error("Missing OpenAI API key");

  const model = (request.model || "gpt-4o-mini").trim() || "gpt-4o-mini";

  const payload = {
    grammar: request.grammar,
    examples: (request.examples || []).map((e) => ({
      exampleId: e.exampleId,
      sentence: e.sentence,
      before: e.before,
      after: e.after,
      matchSpan: e.matchSpan ?? null,
    })),
    task:
      "For each example, produce:\n" +
      "- translation: a natural English translation (1 sentence)\n" +
      "- breakdown: a short segment gloss line like 'X (meaning) Y (meaning)'\n" +
      "- usageNote: a short note explaining how the grammar is functioning in THIS sentence (1 sentence)\n" +
      "- contrast: rewrite the sentence swapping the grammar for a close alternative when reasonable " +
      "(e.g. だから vs ので/ですから), plus a short note about tone/nuance.\n" +
      "Keep everything concise.",
    output_shape: {
      teachings: [
        {
          exampleId: "string",
          translation: "string",
          breakdown: "string",
          usageNote: "string",
          contrast: { alternative: "string", note: "string" },
        },
      ],
    },
  };

  const systemPrompt =
    "You are a Japanese teacher. You must output ONLY valid JSON.\n" +
    "Do not include markdown. Keep notes short and accurate.\n" +
    "If a contrast rewrite is unnatural, set contrast to null.\n";

  const completion = await deps.llm.createChatCompletion({
    apiKey,
    body: {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    },
    signal: opts?.signal,
  });

  const parsed = parseJsonLoose(completion.content) as any;
  const teachingsRaw = parsed?.teachings;
  if (!Array.isArray(teachingsRaw)) return { teachings: [] };

  const teachings: TeachExampleResponse["teachings"] = [];
  for (const row of teachingsRaw) {
    if (!isRecord(row)) continue;
    const exampleId = row.exampleId;
    if (typeof exampleId !== "string" || !exampleId) continue;

    const translation = typeof row.translation === "string" ? row.translation : null;
    const breakdown = typeof row.breakdown === "string" ? row.breakdown : null;
    const usageNote = typeof row.usageNote === "string" ? row.usageNote : null;

    let contrast: { alternative: string; note: string } | null = null;
    if (isRecord(row.contrast)) {
      const alternative = row.contrast.alternative;
      const note = row.contrast.note;
      if (typeof alternative === "string" && typeof note === "string") {
        contrast = { alternative, note };
      }
    }

    teachings.push({ exampleId, translation, breakdown, usageNote, contrast });
  }

  return { teachings };
}

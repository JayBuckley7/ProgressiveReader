import type { GrammarExample } from "@features/grammar/types";
import { fetchOpenAIChatCompletions, getOpenAIChatContent } from "@shared/services/openaiChat";
import { stripMarkdownCodeFences } from "@shared/utils/markdown";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonLoose(raw: string): any {
  const text = stripMarkdownCodeFences(raw || "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Failed to parse JSON response");
  }
}

export async function teachGrammarExamples(
  request: TeachExampleRequest,
  opts?: { signal?: AbortSignal }
): Promise<TeachExampleResponse> {
  const apiKey = (request.apiKey || "").trim();
  const model = (request.model || "gpt-4o-mini").trim() || "gpt-4o-mini";

  // Privacy promise: if the user provides their own key, never send their reading content to the backend.
  if (apiKey) {
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

    const data = await fetchOpenAIChatCompletions({
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

    const parsed = parseJsonLoose(getOpenAIChatContent(data));
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

  const { apiKey: _apiKey, ...fallbackRequest } = request;
  const res = await fetch("/api/grammar/teach-examples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fallbackRequest),
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

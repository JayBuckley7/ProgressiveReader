import { fetchOpenAIChatCompletions, getOpenAIChatContent } from "@shared/services/openaiChat";

export type RefineChoices = Record<string, string | null>;

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableHashHex(input: string): string {
  return fnv1a32(input).toString(16).padStart(8, "0");
}

function stripCodeFences(s: string): string {
  let out = s.trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```[a-zA-Z]*\n?/, "");
    out = out.replace(/```$/, "");
  }
  return out.trim();
}

function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  // Very naive sentence split; good enough for context selection.
  const parts = cleaned.split(/(?<=[.!?])\s+/g);
  return parts.map((s) => s.trim()).filter(Boolean);
}

function pickExampleSentences(text: string, glossKey: string, max: number): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const needle = glossKey.toLowerCase();
  const hits: string[] = [];
  for (const s of sentences) {
    if (hits.length >= max) break;
    if (s.toLowerCase().includes(needle)) hits.push(s);
  }
  if (hits.length >= Math.min(2, max)) return hits;

  // Fallback: take the first few sentences.
  return sentences.slice(0, max);
}

export function getRefineCacheKey(args: {
  bookId: string;
  chapter: number;
  model: string;
  textSample: string;
  ambiguousKeys: string[];
  candidatesByKey: Record<string, Array<{ id: string }>>;
}): string {
  const normalized = {
    model: args.model,
    ambiguousKeys: args.ambiguousKeys.slice().sort(),
    candidatesByKey: Object.fromEntries(
      Object.entries(args.candidatesByKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, v.map((c) => c.id)])
    ),
    textSample: args.textSample.slice(0, 4000),
  };
  const hash = stableHashHex(JSON.stringify(normalized));
  return `prMixRefine:${args.bookId}:${args.chapter}:${args.model}:${hash}`;
}

export async function refineAmbiguousSwaps(args: {
  model: string;
  textSample: string;
  ambiguousKeys: string[];
  candidatesByKey: Record<
    string,
    Array<{ id: string; spelling: string; reading?: string; meaning?: string }>
  >;
  apiKey?: string;
}): Promise<RefineChoices> {
  const model = (args.model || "gpt-4o-mini").trim() || "gpt-4o-mini";
  const keys = Array.from(new Set(args.ambiguousKeys || []))
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 30);

  if (keys.length === 0) return {};

  const apiKey = (args.apiKey || "").trim();

  const candidatesByKey = Object.fromEntries(
    keys.map((glossKey) => [
      glossKey,
      (args.candidatesByKey[glossKey] || [])
        .filter((c) => c && typeof c.id === "string" && typeof c.spelling === "string")
        .slice(0, 3)
        .map((c) => ({
          id: c.id,
          spelling: c.spelling,
          reading: c.reading || "",
          meaning: c.meaning || "",
        })),
    ])
  );

  // If the user supplied their own OpenAI key, call OpenAI directly from the browser so
  // the backend never receives the user's book content.
  if (apiKey) {
    const payload = keys.map((glossKey) => {
      const candidates = (candidatesByKey[glossKey] || []).slice(0, 3);
      return {
        glossKey,
        examples: pickExampleSentences(args.textSample || "", glossKey, 5),
        candidates,
      };
    });

    const system =
      "You choose the best Japanese vocabulary candidate for each English noun phrase in context. " +
      "Return STRICT JSON only, no prose, no markdown.";

    const user =
      "Given the following English context and candidate Japanese words, pick the best replacement for each glossKey. " +
      "If none fit, set it to null.\n\n" +
      "Return JSON in this exact shape:\n" +
      '{ "choices": { "glossKey": "vid/sid or null", "...": null } }\n\n' +
      `Context (excerpt):\n${String(args.textSample || "").slice(0, 4000)}\n\n` +
      `Tasks:\n${JSON.stringify(payload, null, 2)}\n`;

    const data = await fetchOpenAIChatCompletions({
      apiKey,
      body: {
        model,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      },
    });

    const raw = getOpenAIChatContent(data);
    const text = stripCodeFences(raw);
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // If response_format is ignored, attempt a last-ditch extraction.
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsed = JSON.parse(text.slice(start, end + 1));
      } else {
        throw new Error("Failed to parse refine response");
      }
    }

    const choices = parsed?.choices;
    if (!choices || typeof choices !== "object") return {};

    const out: RefineChoices = {};
    for (const glossKey of keys) {
      const v = (choices as any)[glossKey];
      if (v === null) out[glossKey] = null;
      else if (typeof v === "string" && v.trim()) out[glossKey] = v.trim();
      else out[glossKey] = null;
    }
    return out;
  }

  const resp = await fetch("/api/mix/refine", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      textSample: String(args.textSample || "").slice(0, 4000),
      ambiguousKeys: keys,
      candidatesByKey,
    }),
  });

  if (!resp.ok) {
    throw new Error(await resp.text().catch(() => `HTTP ${resp.status}`));
  }

  const data = (await resp.json()) as unknown;
  const choices = (data as any)?.choices;
  if (!choices || typeof choices !== "object") return {};

  const out: RefineChoices = {};
  for (const glossKey of keys) {
    const v = (choices as any)[glossKey];
    if (v === null) out[glossKey] = null;
    else if (typeof v === "string" && v.trim()) out[glossKey] = v.trim();
    else out[glossKey] = null;
  }
  return out;
}

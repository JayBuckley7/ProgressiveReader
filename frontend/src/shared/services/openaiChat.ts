export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
};

export type OpenAIChatCompletionBody = {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  stream?: boolean;
  response_format?: Record<string, unknown>;
  max_tokens?: number;
};

export async function fetchOpenAIChatCompletions(args: {
  apiKey: string;
  body: OpenAIChatCompletionBody;
  signal?: AbortSignal;
}): Promise<unknown> {
  const apiKey = (args.apiKey || "").trim();
  if (!apiKey) throw new Error("Missing OpenAI API key");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(args.body),
    signal: args.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `HTTP ${resp.status}`);
  }

  return (await resp.json()) as unknown;
}

export function getOpenAIChatContent(data: unknown): string {
  const content = (data as any)?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}


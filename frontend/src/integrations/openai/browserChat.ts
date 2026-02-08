import type { LlmChatPort } from "@core/llm/ports";
import type { LlmChatCompletionBody } from "@core/llm/types";

function extractFirstContent(data: unknown): string {
  const content = (data as any)?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

export const browserOpenAiChatPort: LlmChatPort = {
  async createChatCompletion(args: { apiKey: string; body: LlmChatCompletionBody; signal?: AbortSignal }) {
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

    const raw = (await resp.json()) as unknown;
    return { content: extractFirstContent(raw), raw };
  },
};


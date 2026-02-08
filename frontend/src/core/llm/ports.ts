import type { LlmChatCompletion, LlmChatCompletionBody } from "@core/llm/types";

export interface LlmChatPort {
  createChatCompletion(args: {
    apiKey: string;
    body: LlmChatCompletionBody;
    signal?: AbortSignal;
  }): Promise<LlmChatCompletion>;
}


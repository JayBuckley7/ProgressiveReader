export type LlmChatMessage = {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
};

// This matches the subset of the OpenAI-compatible chat-completions request shape
// that the app currently uses (model + messages + a few tuning flags).
export type LlmChatCompletionBody = {
  model: string;
  messages: LlmChatMessage[];
  temperature?: number;
  stream?: boolean;
  response_format?: Record<string, unknown>;
  max_tokens?: number;
};

export type LlmChatCompletion = {
  content: string;
  raw?: unknown;
};


import { stripMarkdownCodeFences } from "@core/utils/markdown";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parse JSON that may be wrapped in Markdown fences or have leading/trailing noise.
 * Intended for LLM responses where "only JSON" is requested but not always respected.
 */
export function parseJsonLoose<T = unknown>(raw: string): T {
  const text = stripMarkdownCodeFences(raw || "");
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw new Error("Failed to parse JSON response");
  }
}


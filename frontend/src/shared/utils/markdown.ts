// Utilities for dealing with common LLM formatting artifacts.

/**
 * Strip markdown code fences from a string.
 *
 * This is intentionally a bit aggressive: we remove leading/trailing fences
 * and any stray fence markers that may appear mid-stream.
 */
export function stripMarkdownCodeFences(text: string): string {
  if (!text) return "";

  let out = String(text).trim();

  if (out.startsWith("```html")) {
    out = out.slice(7).trim();
  } else if (out.startsWith("```")) {
    out = out.slice(3).trim();
  }

  if (out.endsWith("```")) {
    out = out.slice(0, -3).trim();
  }

  // Remove any stray fences that might have been inserted mid-stream.
  out = out.replace(/```html/g, "").replace(/```/g, "");

  return out.trim();
}


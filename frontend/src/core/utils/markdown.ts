// Core-safe utilities for dealing with common LLM formatting artifacts.

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


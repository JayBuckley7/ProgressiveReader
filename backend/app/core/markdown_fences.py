"""Markdown fence helpers used by LLM adapters/services.

Keep this module pure (no Flask/current_app, no key pools) so domain services can
import it without pulling in cross-cutting runtime state.
"""

from __future__ import annotations

from dataclasses import dataclass


def strip_markdown_code_fences(text: str) -> str:
    """Remove ``` and ```html fences from a full response string."""
    if not text:
        return ""
    out = text.strip()
    if out.startswith("```html"):
        out = out[7:].strip()
    elif out.startswith("```"):
        out = out[3:].strip()
    if out.endswith("```"):
        out = out[:-3].strip()
    # Also remove any stray fences that might have been inserted mid-stream.
    out = out.replace("```html", "").replace("```", "")
    return out.strip()


@dataclass
class StreamFenceStripper:
    """Best-effort incremental stripper for markdown fences across chunk boundaries.

    Keeps a short carry buffer so sequences like ```html split across chunks are still removed.
    """

    _carry: str = ""

    def feed(self, chunk: str) -> str:
        if not chunk:
            return ""
        buf = (self._carry + chunk).replace("```html", "").replace("```", "")

        # Keep a small tail to catch fence markers split across boundaries.
        tail_len = 6  # len("```htm") - 1, enough to catch the next fence prefix
        if len(buf) <= tail_len:
            self._carry = buf
            return ""

        out, self._carry = buf[:-tail_len], buf[-tail_len:]
        return out

    def flush(self) -> str:
        buf = self._carry.replace("```html", "").replace("```", "")
        self._carry = ""
        return buf


__all__ = ["StreamFenceStripper", "strip_markdown_code_fences"]


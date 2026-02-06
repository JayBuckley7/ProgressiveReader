import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";

import { getGrammarPointById } from "@features/grammar/data/grammarCatalog";
import type { GrammarPoint } from "@features/grammar/data/grammarCatalog";
import { useGrammar } from "@features/grammar/contexts/GrammarContext";
import { getJpdbData } from "@features/reader/content/word";

type UseGrammarReadAlongArgs = {
  contentRef: RefObject<HTMLElement>;
  jpdbHighlighted: boolean;
  isPdf: boolean;
  isTranslated: boolean;
  contentVersion: number;
};

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.bottom >= b.top && a.top <= b.bottom;
}

function clearGrammarMarks(root: HTMLElement): void {
  const nodes = root.querySelectorAll(".jpdb-word.pr-grammar-hit--candidate, .jpdb-word.pr-grammar-hit--confirmed");
  nodes.forEach((el) => {
    el.classList.remove("pr-grammar-hit--candidate");
    el.classList.remove("pr-grammar-hit--confirmed");
    (el as HTMLElement).removeAttribute("data-pr-grammar-ids");
  });
}

function findHintSpans(text: string, hints: string[]): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  for (const hint of hints) {
    if (!hint) continue;
    let idx = text.indexOf(hint);
    while (idx >= 0) {
      spans.push({ start: idx, end: idx + hint.length });
      idx = text.indexOf(hint, idx + Math.max(1, hint.length));
    }
  }
  return spans;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function addGrammarId(el: HTMLElement, grammarId: string): void {
  const raw = el.getAttribute("data-pr-grammar-ids") || "";
  const set = new Set(raw.split(",").map((x) => x.trim()).filter(Boolean));
  set.add(grammarId);
  el.setAttribute("data-pr-grammar-ids", Array.from(set).join(","));
}

export function useGrammarReadAlong({
  contentRef,
  jpdbHighlighted,
  isPdf,
  isTranslated,
  contentVersion,
}: UseGrammarReadAlongArgs): void {
  const { underlinesEnabled, state } = useGrammar();

  const learningPoints: GrammarPoint[] = useMemo(() => {
    const points: GrammarPoint[] = [];
    for (const gid of state.learningIds) {
      const p = getGrammarPointById(gid);
      if (!p || p.hintQuality !== "ok") continue;
      if (!p.hints || p.hints.length === 0) continue;
      points.push(p);
    }
    return points;
  }, [state.learningIds]);

  const throttleRef = useRef<number | null>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const enabled = underlinesEnabled && jpdbHighlighted && !isPdf && !isTranslated && learningPoints.length > 0;

    if (!enabled) {
      clearGrammarMarks(root);
      return;
    }

    const runScan = () => {
      const el = contentRef.current;
      if (!el) return;

      // Only process likely paragraph-ish blocks in the visible viewport.
      const containerRect = el.getBoundingClientRect();
      const blocks = Array.from(
        el.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6")
      ) as HTMLElement[];

      // Throttle overall work: cap blocks per scan.
      const visibleBlocks = blocks.filter((b) => intersects(b.getBoundingClientRect(), containerRect)).slice(0, 50);

      for (const block of visibleBlocks) {
        const wordEls = Array.from(block.querySelectorAll(".jpdb-word")) as HTMLElement[];
        if (wordEls.length === 0) continue;

        // Clear previous marks for this block before reapplying.
        for (const w of wordEls) {
          w.classList.remove("pr-grammar-hit--candidate");
          w.classList.remove("pr-grammar-hit--confirmed");
          w.removeAttribute("data-pr-grammar-ids");
        }

        const firstData = getJpdbData(wordEls[0]);
        const context = firstData?.context || "";
        if (!context) continue;

        const spansByGrammarId = new Map<string, Array<{ start: number; end: number }>>();
        for (const p of learningPoints) {
          const spans = findHintSpans(context, p.hints);
          if (spans.length > 0) spansByGrammarId.set(p.id, spans);
        }
        if (spansByGrammarId.size === 0) continue;

        for (const w of wordEls) {
          const jd = getJpdbData(w);
          if (!jd) continue;
          const tStart = Number(jd.token?.start);
          const tEnd = Number(jd.token?.end);
          if (!Number.isFinite(tStart) || !Number.isFinite(tEnd)) continue;

          let hit = false;
          for (const [gid, spans] of spansByGrammarId.entries()) {
            if (spans.some((s) => overlaps(tStart, tEnd, s.start, s.end))) {
              addGrammarId(w, gid);
              hit = true;
            }
          }

          if (hit) {
            w.classList.add("pr-grammar-hit--candidate");
          }
        }
      }
    };

    const schedule = () => {
      if (throttleRef.current !== null) return;
      throttleRef.current = window.setTimeout(() => {
        throttleRef.current = null;
        runScan();
      }, 500);
    };

    // Initial scan (after JPDB wraps are likely applied).
    schedule();

    root.addEventListener("scroll", schedule, { passive: true } as any);
    window.addEventListener("resize", schedule);

    return () => {
      root.removeEventListener("scroll", schedule as any);
      window.removeEventListener("resize", schedule as any);
      if (throttleRef.current !== null) {
        window.clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlinesEnabled, jpdbHighlighted, isPdf, isTranslated, learningPoints, contentVersion]);
}

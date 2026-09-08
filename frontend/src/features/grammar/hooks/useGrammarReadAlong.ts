import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";

import { getGrammarPointById } from "@features/grammar/data/grammarCatalog";
import type { GrammarPoint } from "@features/grammar/data/grammarCatalog";
import { useGrammar } from "@features/grammar/contexts/GrammarContext";
import { getJpdbData } from "@features/reader/content/word";

type UseGrammarReadAlongArgs = {
  contentRef: RefObject<HTMLElement>;
  /** The clipped/scrolled reader viewport. Defaults to contentRef for legacy callers. */
  viewportRef?: RefObject<HTMLElement>;
  /** Segment IDs belonging to the current visual page. Omit outside the reflow reader. */
  visibleSegmentIds?: readonly string[];
  /** Changes whenever the visual page changes, including within one long segment. */
  pageIdentity?: unknown;
  jpdbHighlighted: boolean;
  isPdf: boolean;
  isTranslated: boolean;
  contentVersion: number;
};

function intersects(a: DOMRect, b: DOMRect): boolean {
  return (
    a.right > b.left &&
    a.left < b.right &&
    a.bottom > b.top &&
    a.top < b.bottom
  );
}

function elementIntersectsViewport(element: HTMLElement, viewportRect: DOMRect): boolean {
  const rects = Array.from(element.getClientRects());
  if (rects.length > 0) {
    return rects.some((rect) => intersects(rect as DOMRect, viewportRect));
  }
  return intersects(element.getBoundingClientRect(), viewportRect);
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
  viewportRef,
  visibleSegmentIds,
  pageIdentity,
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
  const markedElementsRef = useRef<Set<HTMLElement>>(new Set());

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const clearTrackedMarks = () => {
      markedElementsRef.current.forEach((element) => {
        element.classList.remove("pr-grammar-hit--candidate");
        element.classList.remove("pr-grammar-hit--confirmed");
        element.removeAttribute("data-pr-grammar-ids");
      });
      markedElementsRef.current.clear();
    };

    const enabled = underlinesEnabled && jpdbHighlighted && !isPdf && !isTranslated && learningPoints.length > 0;

    if (!enabled) {
      clearTrackedMarks();
      clearGrammarMarks(root);
      return;
    }

    const runScan = () => {
      const el = contentRef.current;
      const viewport = viewportRef?.current ?? el;
      if (!el || !viewport) return;

      // Marks are intentionally page-local. Clearing only elements previously
      // touched by this hook avoids walking or reprocessing the whole chapter.
      clearTrackedMarks();

      // The reflow content can be many viewport widths wide. Use the clipped
      // outer reader as the viewport and check both axes so adjacent columns do
      // not count as visible merely because their vertical coordinates overlap.
      const viewportRect = viewport.getBoundingClientRect();
      const visibleSegmentSet = visibleSegmentIds === undefined
        ? null
        : new Set(visibleSegmentIds);
      const blocks = Array.from(
        el.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6")
      ) as HTMLElement[];

      // Throttle overall work: cap blocks per scan.
      const visibleBlocks = blocks
        .filter((block) => {
          if (visibleSegmentSet) {
            const segment = block.closest<HTMLElement>("[data-pr-segment-id]");
            const segmentId = segment?.dataset.prSegmentId;
            if (!segmentId || !visibleSegmentSet.has(segmentId)) return false;
          }
          return elementIntersectsViewport(block, viewportRect);
        })
        .slice(0, 50);

      for (const block of visibleBlocks) {
        const allWordEls = Array.from(block.querySelectorAll(".jpdb-word")) as HTMLElement[];
        const wordEls = allWordEls.filter((word) => elementIntersectsViewport(word, viewportRect));
        if (wordEls.length === 0) continue;

        // Context belongs to the whole JPDB block, so it may live on a token
        // outside the clipped page when a long paragraph spans columns.
        const firstData = getJpdbData(allWordEls[0]);
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
            markedElementsRef.current.add(w);
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

    const scrollContainer = viewportRef?.current ?? root;
    scrollContainer.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    // JPDB may wrap a newly-visible page asynchronously after the page turn.
    // Child-list observation schedules one follow-up without reacting to this
    // hook's own class/attribute changes.
    const mutationObserver = typeof MutationObserver === "function"
      ? new MutationObserver(schedule)
      : null;
    mutationObserver?.observe(root, { childList: true, subtree: true });

    return () => {
      scrollContainer.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mutationObserver?.disconnect();
      if (throttleRef.current !== null) {
        window.clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      clearTrackedMarks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    underlinesEnabled,
    jpdbHighlighted,
    isPdf,
    isTranslated,
    learningPoints,
    contentVersion,
    pageIdentity,
    visibleSegmentIds,
  ]);
}

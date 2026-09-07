import React, { useEffect, useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { renderWithProviders } from "../test-utils";
import { useGrammarReadAlong } from "@features/grammar/hooks/useGrammarReadAlong";

function setRect(el: HTMLElement, rect: Partial<DOMRect>) {
  // happy-dom returns zero rects; we stub per element.
  (el as any).getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 300,
      width: 300,
      height: 300,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
}

function setGrammarTokenData(element: HTMLElement, start: number, end: number, context: string) {
  (element as any).jpdbData = {
    token: { start, end },
    context,
    contextOffset: start,
  };
}

const SHARED_SEGMENT_IDS = ["shared-segment"] as const;

describe("useGrammarReadAlong", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem("prGrammarMiningEnabled", "false");
    localStorage.setItem("prGrammarUnderlinesEnabled", "true");
    localStorage.setItem(
      "grammar_state_v2",
      JSON.stringify({
        version: 2,
        knownIds: [],
        learningIds: ["n5:ている"],
        examplesByGrammarId: {},
        scanByGrammarId: {},
        lastUpdatedMs: Date.now(),
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.setItem("prGrammarMiningEnabled", "false");
    localStorage.setItem("prGrammarUnderlinesEnabled", "false");
    localStorage.removeItem("grammar_state_v2");
  });

  it("adds underline class + data attribute for learning grammar hints", async () => {
    function Harness() {
      const contentRef = useRef<HTMLDivElement>(null);
      const tokenRef = useRef<HTMLSpanElement>(null);

      useGrammarReadAlong({
        contentRef: contentRef as React.RefObject<HTMLElement>,
        jpdbHighlighted: true,
        isPdf: false,
        isTranslated: false,
        contentVersion: 0,
      });

      useEffect(() => {
        const root = contentRef.current;
        const tokenEl = tokenRef.current;
        if (!root || !tokenEl) return;

        setRect(root, { top: 0, bottom: 400 });

        const p = root.querySelector("p") as HTMLElement | null;
        if (p) setRect(p, { top: 10, bottom: 40 });
        setRect(tokenEl, { top: 14, bottom: 34 });

        setGrammarTokenData(tokenEl, 4, 7, "今、食べている。");
      }, []);

      return (
        <div ref={contentRef}>
          <p>
            <span className="jpdb-word" ref={tokenRef}>
              ている
            </span>
          </p>
        </div>
      );
    }

    const { container } = renderWithProviders(<Harness />);

    // Initial scan is throttled 500ms.
    await vi.advanceTimersByTimeAsync(600);

    const token = container.querySelector(".jpdb-word") as HTMLElement | null;
    expect(token).toBeTruthy();
    expect(token?.classList.contains("pr-grammar-hit--candidate")).toBe(true);
    expect(token?.getAttribute("data-pr-grammar-ids")).toContain("n5:ている");
  });

  it("marks only tokens inside the clipped horizontal page", async () => {
    function Harness({ page }: { page: number }) {
      const viewportRef = useRef<HTMLDivElement>(null);
      const contentRef = useRef<HTMLDivElement>(null);
      const firstTokenRef = useRef<HTMLSpanElement>(null);
      const secondTokenRef = useRef<HTMLSpanElement>(null);

      useGrammarReadAlong({
        contentRef: contentRef as React.RefObject<HTMLElement>,
        viewportRef: viewportRef as React.RefObject<HTMLElement>,
        visibleSegmentIds: SHARED_SEGMENT_IDS,
        pageIdentity: page,
        jpdbHighlighted: true,
        isPdf: false,
        isTranslated: false,
        contentVersion: 0,
      });

      useEffect(() => {
        const viewport = viewportRef.current;
        const content = contentRef.current;
        const firstToken = firstTokenRef.current;
        const secondToken = secondTokenRef.current;
        const block = content?.querySelector("p") as HTMLElement | null;
        if (!viewport || !content || !block || !firstToken || !secondToken) return;

        const pageOffset = page * 320;
        setRect(viewport, { left: 0, right: 300, top: 0, bottom: 400 });
        setRect(content, { left: -pageOffset, right: 650 - pageOffset, top: 0, bottom: 400 });
        setRect(block, { left: -pageOffset, right: 650 - pageOffset, top: 10, bottom: 60 });
        setRect(firstToken, { left: 10 - pageOffset, right: 70 - pageOffset, top: 20, bottom: 45 });
        setRect(secondToken, { left: 330 - pageOffset, right: 390 - pageOffset, top: 20, bottom: 45 });

        const context = "今、食べている。 また食べている。";
        setGrammarTokenData(firstToken, 4, 7, context);
        setGrammarTokenData(secondToken, 13, 16, context);
      }, [page]);

      return (
        <div ref={viewportRef}>
          <div ref={contentRef}>
            <p data-pr-segment-id="shared-segment">
              <span className="jpdb-word" data-testid="first-token" ref={firstTokenRef}>
                ている
              </span>
              <span className="jpdb-word" data-testid="second-token" ref={secondTokenRef}>
                ている
              </span>
            </p>
          </div>
        </div>
      );
    }

    const rendered = renderWithProviders(<Harness page={0} />);
    await vi.advanceTimersByTimeAsync(600);

    const firstToken = rendered.getByTestId("first-token");
    const secondToken = rendered.getByTestId("second-token");
    expect(firstToken.classList.contains("pr-grammar-hit--candidate")).toBe(true);
    expect(secondToken.classList.contains("pr-grammar-hit--candidate")).toBe(false);

    // This models a page turn within one long segment: the segment ID stays the
    // same, but pageIdentity and viewport-relative token rectangles change.
    rendered.rerender(<Harness page={1} />);
    await vi.advanceTimersByTimeAsync(600);

    expect(firstToken.classList.contains("pr-grammar-hit--candidate")).toBe(false);
    expect(secondToken.classList.contains("pr-grammar-hit--candidate")).toBe(true);
  });

  it("does not process geometrically visible segments outside the current page", async () => {
    function Harness() {
      const viewportRef = useRef<HTMLDivElement>(null);
      const contentRef = useRef<HTMLDivElement>(null);
      const currentTokenRef = useRef<HTMLSpanElement>(null);
      const nextTokenRef = useRef<HTMLSpanElement>(null);

      useGrammarReadAlong({
        contentRef: contentRef as React.RefObject<HTMLElement>,
        viewportRef: viewportRef as React.RefObject<HTMLElement>,
        visibleSegmentIds: ["current"],
        pageIdentity: 0,
        jpdbHighlighted: true,
        isPdf: false,
        isTranslated: false,
        contentVersion: 0,
      });

      useEffect(() => {
        const viewport = viewportRef.current;
        const content = contentRef.current;
        const currentBlock = content?.querySelector("[data-pr-segment-id='current']") as HTMLElement | null;
        const nextBlock = content?.querySelector("[data-pr-segment-id='next']") as HTMLElement | null;
        const currentToken = currentTokenRef.current;
        const nextToken = nextTokenRef.current;
        if (!viewport || !currentBlock || !nextBlock || !currentToken || !nextToken) return;

        setRect(viewport, { left: 0, right: 300, top: 0, bottom: 400 });
        setRect(currentBlock, { left: 10, right: 200, top: 10, bottom: 40 });
        setRect(nextBlock, { left: 10, right: 200, top: 50, bottom: 80 });
        setRect(currentToken, { left: 20, right: 80, top: 15, bottom: 35 });
        setRect(nextToken, { left: 20, right: 80, top: 55, bottom: 75 });
        setGrammarTokenData(currentToken, 4, 7, "今、食べている。");
        setGrammarTokenData(nextToken, 4, 7, "今、食べている。");
      }, []);

      return (
        <div ref={viewportRef}>
          <div ref={contentRef}>
            <p data-pr-segment-id="current">
              <span className="jpdb-word" data-testid="current-token" ref={currentTokenRef}>ている</span>
            </p>
            <p data-pr-segment-id="next">
              <span className="jpdb-word" data-testid="next-token" ref={nextTokenRef}>ている</span>
            </p>
          </div>
        </div>
      );
    }

    const rendered = renderWithProviders(<Harness />);
    await vi.advanceTimersByTimeAsync(600);

    expect(rendered.getByTestId("current-token").classList.contains("pr-grammar-hit--candidate")).toBe(true);
    expect(rendered.getByTestId("next-token").classList.contains("pr-grammar-hit--candidate")).toBe(false);
  });

  it("keeps PDF content out of grammar read-along processing", async () => {
    function Harness() {
      const contentRef = useRef<HTMLDivElement>(null);
      const tokenRef = useRef<HTMLSpanElement>(null);

      useGrammarReadAlong({
        contentRef: contentRef as React.RefObject<HTMLElement>,
        jpdbHighlighted: true,
        isPdf: true,
        isTranslated: false,
        contentVersion: 0,
      });

      useEffect(() => {
        const root = contentRef.current;
        const token = tokenRef.current;
        const block = root?.querySelector("p") as HTMLElement | null;
        if (!root || !block || !token) return;
        setRect(root, { left: 0, right: 300, top: 0, bottom: 400 });
        setRect(block, { left: 10, right: 200, top: 10, bottom: 40 });
        setRect(token, { left: 20, right: 80, top: 15, bottom: 35 });
        setGrammarTokenData(token, 4, 7, "今、食べている。");
      }, []);

      return (
        <div ref={contentRef}>
          <p><span className="jpdb-word" data-testid="pdf-token" ref={tokenRef}>ている</span></p>
        </div>
      );
    }

    const rendered = renderWithProviders(<Harness />);
    await vi.advanceTimersByTimeAsync(600);

    expect(rendered.getByTestId("pdf-token").classList.contains("pr-grammar-hit--candidate")).toBe(false);
  });
});

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

        (tokenEl as any).jpdbData = {
          token: { start: 4, end: 7 },
          context: "今、食べている。",
          contextOffset: 4,
        };
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
});

import { describe, expect, it } from "vitest";

import {
  createPageGeometry,
  logicalOffsetForPage,
  pageIndexForContentRect,
  pageIndexFromScrollLeft,
  physicalScrollLeftForPage,
} from "../geometry";

describe("reflow pagination geometry", () => {
  it("accounts for CSS column gaps when counting and positioning horizontal pages", () => {
    const geometry = createPageGeometry({
      mode: "horizontal-columns",
      viewportInlineSize: 100,
      contentInlineSize: 340,
      gap: 20,
    });

    expect(geometry.pageCount).toBe(3);
    expect(geometry.stride).toBe(120);
    expect(logicalOffsetForPage(1, geometry)).toBe(120);
    expect(physicalScrollLeftForPage(2, geometry)).toBe(240);
    expect(pageIndexFromScrollLeft(121, geometry)).toBe(1);
  });

  it("starts vertical-rl at the physical right edge and progresses left", () => {
    const geometry = createPageGeometry({
      mode: "vertical-rl",
      viewportInlineSize: 100,
      contentInlineSize: 400,
      gap: 40,
    });

    expect(geometry.pageCount).toBe(4);
    expect(geometry.gap).toBe(0);
    expect(physicalScrollLeftForPage(0, geometry)).toBe(300);
    expect(physicalScrollLeftForPage(1, geometry)).toBe(200);
    expect(physicalScrollLeftForPage(3, geometry)).toBe(0);
    expect(pageIndexFromScrollLeft(200, geometry)).toBe(1);
  });

  it("maps physical content rectangles to reading-order pages", () => {
    const horizontal = createPageGeometry({
      mode: "horizontal-columns",
      viewportInlineSize: 100,
      contentInlineSize: 340,
      gap: 20,
    });
    const vertical = createPageGeometry({
      mode: "vertical-rl",
      viewportInlineSize: 100,
      contentInlineSize: 400,
    });

    expect(pageIndexForContentRect({ inlineStart: 125, inlineEnd: 150 }, horizontal)).toBe(1);
    expect(pageIndexForContentRect({ inlineStart: 305, inlineEnd: 390 }, vertical)).toBe(0);
    expect(pageIndexForContentRect({ inlineStart: 205, inlineEnd: 290 }, vertical)).toBe(1);
  });

  it("clamps a short final page to the actual maximum scroll offset", () => {
    const geometry = createPageGeometry({
      mode: "horizontal-columns",
      viewportInlineSize: 100,
      contentInlineSize: 225,
      gap: 20,
    });

    expect(geometry.pageCount).toBe(3);
    expect(physicalScrollLeftForPage(2, geometry)).toBe(125);
    expect(pageIndexFromScrollLeft(125, geometry)).toBe(2);
  });
});

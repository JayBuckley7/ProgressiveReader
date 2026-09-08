import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureReflowAnchor,
  rangeForAnchor,
  reflowAnchorForElement,
  SEGMENT_ID_ATTRIBUTE,
  SOURCE_HASH_ATTRIBUTE,
  SOURCE_LENGTH_ATTRIBUTE,
} from "../domAnchors";

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("reflow DOM anchors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (document as Document & { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
    document.body.innerHTML = "";
  });

  it("resolves code-point offsets across blocks sharing a segment", () => {
    const content = document.createElement("div");
    content.innerHTML = [
      `<p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="hash-1">alpha</p>`,
      `<p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="hash-1">😀beta</p>`,
    ].join("");
    document.body.append(content);

    const range = rangeForAnchor(content, {
      segmentId: "segment-1",
      sourceHash: "hash-1",
      textOffset: 8,
    });

    expect(range?.startContainer.textContent).toBe("😀beta");
    expect(range?.startOffset).toBe(2);
  });

  it("captures a caret as a stable segment/code-point anchor", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    content.innerHTML = [
      `<p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="hash-1">alpha</p>`,
      `<p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="hash-1">😀beta</p>`,
    ].join("");
    viewport.append(content);
    document.body.append(viewport);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 320, 480)
    );
    const secondText = content.querySelectorAll("p")[1].firstChild as Text;
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => ({ offsetNode: secondText, offset: 2 }),
    });

    expect(captureReflowAnchor(viewport, content, "horizontal-columns")).toEqual({
      segmentId: "segment-1",
      sourceHash: "hash-1",
      textOffset: 8,
    });
  });

  it("scans past leading whitespace and preserves Unicode caret offsets", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    content.innerHTML = `   <p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="hash-1">😀alpha</p>`;
    viewport.append(content);
    document.body.append(viewport);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(rect(10, 20, 310, 420));
    const whitespace = content.firstChild as Text;
    const text = content.querySelector("p")?.firstChild as Text;
    const caretPositionFromPoint = vi.fn()
      .mockReturnValueOnce({ offsetNode: whitespace, offset: 1 })
      .mockReturnValueOnce({ offsetNode: whitespace, offset: 2 })
      .mockReturnValue({ offsetNode: text, offset: 2 });
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: caretPositionFromPoint,
    });

    expect(captureReflowAnchor(viewport, content, "horizontal-columns")).toEqual({
      segmentId: "segment-1",
      sourceHash: "hash-1",
      textOffset: 1,
    });
    expect(caretPositionFromPoint).toHaveBeenCalledTimes(3);
    expect(caretPositionFromPoint.mock.calls[0]).toEqual([12, 22]);
  });

  it("continues probing after media and uses the right edge for vertical text", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    content.innerHTML = [
      `<figure ${SEGMENT_ID_ATTRIBUTE}="media" ${SOURCE_HASH_ATTRIBUTE}="media-hash"><img alt=""></figure>`,
      `<p ${SEGMENT_ID_ATTRIBUTE}="sentence" ${SOURCE_HASH_ATTRIBUTE}="text-hash">本文です。</p>`,
    ].join("");
    viewport.append(content);
    document.body.append(viewport);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(rect(10, 20, 310, 420));
    const image = content.querySelector("img") as HTMLImageElement;
    const text = content.querySelector("p")?.firstChild as Text;
    const caretPositionFromPoint = vi.fn()
      .mockReturnValueOnce({ offsetNode: image, offset: 0 })
      .mockReturnValue({ offsetNode: text, offset: 2 });
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: caretPositionFromPoint,
    });

    expect(captureReflowAnchor(viewport, content, "vertical-rl")).toEqual({
      segmentId: "sentence",
      sourceHash: "text-hash",
      textOffset: 2,
    });
    expect(caretPositionFromPoint.mock.calls[0]).toEqual([308, 22]);
  });

  it("estimates the first visible Unicode offset when every caret probe misses", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    content.innerHTML = `<p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="hash-1">ab😀cd</p>`;
    viewport.append(content);
    document.body.append(viewport);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(rect(0, 0, 100, 200));
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => null,
    });

    const text = content.querySelector("p")?.firstChild as Text;
    const characterRects = [
      rect(-30, 10, -20, 30),
      rect(-20, 10, -10, 30),
      rect(-10, 10, 0, 30),
      rect(10, 10, 20, 30),
      rect(20, 10, 30, 30),
    ];
    let geometryReads = 0;
    vi.spyOn(document, "createRange").mockImplementation(() => {
      let selectedNode: Node | null = null;
      let start = 0;
      let end = 0;
      return {
        selectNodeContents(node: Node) {
          selectedNode = node;
          start = 0;
          end = node.textContent?.length ?? 0;
        },
        setStart(node: Node, offset: number) {
          selectedNode = node;
          start = offset;
        },
        setEnd(node: Node, offset: number) {
          selectedNode = node;
          end = offset;
        },
        getClientRects() {
          geometryReads += 1;
          if (selectedNode !== text && selectedNode !== content.querySelector("p")) {
            return [] as unknown as DOMRectList;
          }
          const boundaries = [0, 1, 2, 4, 5, 6];
          const first = boundaries.findIndex((boundary) => boundary >= start);
          const last = boundaries.findIndex((boundary) => boundary >= end);
          return characterRects.slice(
            Math.max(0, first),
            last < 0 ? characterRects.length : last
          ) as unknown as DOMRectList;
        },
      } as unknown as Range;
    });

    expect(captureReflowAnchor(viewport, content, "horizontal-columns")).toEqual({
      segmentId: "segment-1",
      sourceHash: "hash-1",
      textOffset: 3,
    });
    expect(geometryReads).toBeLessThan(12);
  });

  it("rejects an anchor from a different source revision", () => {
    const content = document.createElement("div");
    content.innerHTML = `<p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="new-hash">text</p>`;

    expect(
      rangeForAnchor(content, {
        segmentId: "segment-1",
        sourceHash: "old-hash",
        textOffset: 0,
      })
    ).toBeNull();
  });

  it("keeps offsets in source coordinates when translated text has a different length", () => {
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    content.innerHTML = `<p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="hash-1" ${SOURCE_LENGTH_ATTRIBUTE}="5">abcdefghij</p>`;
    viewport.append(content);
    document.body.append(viewport);
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 480));
    const text = content.querySelector("p")?.firstChild as Text;
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: () => ({ offsetNode: text, offset: 4 }),
    });

    expect(captureReflowAnchor(viewport, content, "horizontal-columns")?.textOffset).toBe(2);
    const restored = rangeForAnchor(content, {
      segmentId: "segment-1",
      sourceHash: "hash-1",
      textOffset: 2,
    });
    expect(restored?.startOffset).toBe(4);
  });

  it("anchors an EPUB fragment at its exact Unicode offset inside a long segment", () => {
    const content = document.createElement("div");
    content.innerHTML = [
      `<p ${SEGMENT_ID_ATTRIBUTE}="segment-1" ${SOURCE_HASH_ATTRIBUTE}="hash-1">`,
      'Before 😀 text. <span id="late-fragment">Target text.</span>',
      "</p>",
    ].join("");
    const fragment = content.querySelector("#late-fragment") as HTMLElement;

    expect(reflowAnchorForElement(content, fragment)).toEqual({
      segmentId: "segment-1",
      sourceHash: "hash-1",
      textOffset: 15,
    });
  });
});

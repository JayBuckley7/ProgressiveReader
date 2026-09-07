import { describe, expect, it } from "vitest";

import {
  buildSourceSegments,
  codePointLength,
  stableSourceHash,
} from "../sourceSegments";

describe("source segmentation", () => {
  it("uses SHA-256 for content-addressed source hashes", () => {
    expect(stableSourceHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("is deterministic and independent of viewport layout", () => {
    const blocks = [
      { key: "heading", text: "第一章" },
      { key: "p-1", text: "これは最初の文です。これは二番目の文です。" },
      { key: "p-2", text: "A final paragraph with another complete sentence." },
    ];

    const first = buildSourceSegments(blocks, { targetCodePoints: 64, locale: "ja" });
    const second = buildSourceSegments(blocks, { targetCodePoints: 64, locale: "ja" });

    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
    expect(new Set(first.map((segment) => segment.id)).size).toBe(first.length);
    expect(first.every((segment) => /^[a-f0-9]{64}$/u.test(segment.sourceHash))).toBe(true);
    if (first.length > 1) {
      expect(first.at(-1)?.sourceHash).not.toBe(first[0].sourceHash);
    }
  });

  it("splits an oversized sentence on code-point boundaries", () => {
    const text = `${"語".repeat(90)}${"😀".repeat(90)}`;
    const segments = buildSourceSegments(text, { targetCodePoints: 64, locale: "ja" });

    expect(segments.length).toBe(3);
    expect(segments.map((segment) => segment.codePointLength)).toEqual([64, 64, 52]);
    expect(segments.map((segment) => segment.text).join("")) .toBe(text);
    expect(codePointLength(text)).toBe(180);
  });

  it("keeps an explicitly atomic source block in one segment", () => {
    const text = "long ".repeat(80).trim();
    const segments = buildSourceSegments(
      [{ key: "rich-inline-block", text }],
      { targetCodePoints: 64, splitLongBlocks: false }
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe(text);
  });

  it("hashes Unicode sources consistently", () => {
    expect(stableSourceHash("日本語😀")).toBe(stableSourceHash("日本語😀"));
    expect(stableSourceHash("日本語😀")).not.toBe(stableSourceHash("日本語😃"));
  });
});

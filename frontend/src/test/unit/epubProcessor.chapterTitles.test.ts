import { beforeEach, describe, expect, it, vi } from "vitest";

import { EpubProcessorWrapper } from "@shared/lib/epubProcessor";

const epubFactory = vi.hoisted(() => vi.fn());

vi.mock("epubjs", () => ({
  default: epubFactory,
}));

describe("EpubProcessorWrapper chapter titles", () => {
  beforeEach(() => {
    epubFactory.mockReturnValue({
      ready: Promise.resolve(),
      navigation: {
        toc: [
          {
            label: "  Opening  ",
            href: "opening.xhtml",
            subitems: [{ label: "First scene", href: "scene-1.xhtml" }],
          },
        ],
      },
      spine: {
        spineItems: [{ href: "opening.xhtml" }, { href: "scene-1.xhtml" }],
      },
      packaging: { metadata: { title: "Test book" } },
    });
  });

  it("exposes trimmed TOC labels through the ChapterTitle title field", async () => {
    const processor = new EpubProcessorWrapper();

    expect(await processor.loadBook(new ArrayBuffer(512))).toBe(true);
    await expect(processor.getChapterTitles()).resolves.toEqual([
      { index: 0, title: "Opening", href: "opening.xhtml" },
      { index: 1, title: "First scene", href: "scene-1.xhtml" },
    ]);
  });
});

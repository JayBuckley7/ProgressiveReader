import { describe, expect, it } from "vitest";

import {
  alignLegacyChapterTranslation,
  readAndAlignLegacyChapterTranslation,
} from "@features/reader/utils/legacyTranslationAlignment";
import type { TranslationCacheEntry, TranslationCachePort } from "@core/translation/cachePort";

const legacyEntry: TranslationCacheEntry = {
  content:
    '<div data-pr-segment-id="first"><p>One</p></div><div data-pr-segment-id="second"><p>Two</p></div>',
  timestamp: 123,
  useCefr: true,
  targetLanguage: "English",
  cefrLevel: "B2",
};

describe("legacy chapter translation alignment", () => {
  it("prefers explicit segment ids", () => {
    const aligned = alignLegacyChapterTranslation(legacyEntry, [
      { id: "second", html: "<p>二</p>", sourceHash: "hash-2" },
      { id: "first", html: "<p>一</p>", sourceHash: "hash-1" },
    ]);

    expect(aligned?.strategy).toBe("segment-id");
    expect(aligned?.segments[0]).toMatchObject({
      id: "second",
      translatedHtml: expect.stringContaining("Two"),
      sourceHash: "hash-2",
    });
    expect(aligned?.legacyTimestamp).toBe(123);
  });

  it("only uses ordered blocks when their count exactly matches", () => {
    const ordered = alignLegacyChapterTranslation(
      { ...legacyEntry, content: "<main><p>One</p><p>Two</p></main>" },
      [
        { id: "first", html: "<p>一</p>" },
        { id: "second", html: "<p>二</p>" },
      ]
    );
    const ambiguous = alignLegacyChapterTranslation(
      { ...legacyEntry, content: "<main><p>Only one block</p></main>" },
      [
        { id: "first", html: "<p>一</p>" },
        { id: "second", html: "<p>二</p>" },
      ]
    );

    expect(ordered?.strategy).toBe("ordered-blocks");
    expect(ordered?.segments.map((segment) => segment.translatedHtml)).toEqual([
      "<p>One</p>",
      "<p>Two</p>",
    ]);
    expect(ambiguous).toBeNull();
  });

  it("groups preserved legacy blocks using the source segment structure", () => {
    const aligned = alignLegacyChapterTranslation(
      { ...legacyEntry, content: "<h2>One</h2><p>First</p><p>Second</p>" },
      [
        { id: "first", html: "<h2>一</h2><p>最初</p>", sourceHash: "hash-1" },
        { id: "second", html: "<p>二番</p>", sourceHash: "hash-2" },
      ]
    );

    expect(aligned?.strategy).toBe("ordered-blocks");
    expect(aligned?.segments[0].translatedHtml).toBe("<h2>One</h2>\n<p>First</p>");
    expect(aligned?.segments[1].translatedHtml).toBe("<p>Second</p>");
  });

  it("checks language, CEFR level, and CEFR mode before reading legacy content", () => {
    const cache: TranslationCachePort = {
      get: () => legacyEntry,
      set: () => {},
      remove: () => {},
    };
    const common = {
      cache,
      bookId: "book",
      chapter: 0,
      sourceSegments: [{ id: "whole", html: "<p>source</p>" }],
      targetLanguage: "English",
      cefrLevel: "B2",
    };

    expect(readAndAlignLegacyChapterTranslation({ ...common, useCefr: true })?.strategy).toBe(
      "whole-chapter"
    );
    expect(readAndAlignLegacyChapterTranslation({ ...common, useCefr: false })).toBeNull();
    expect(
      readAndAlignLegacyChapterTranslation({ ...common, targetLanguage: "Japanese", useCefr: true })
    ).toBeNull();
  });

  it("does not invalidate a plain legacy translation when only the unused CEFR level changes", () => {
    const cache: TranslationCachePort = {
      get: () => ({ ...legacyEntry, useCefr: false, cefrLevel: "A1" }),
      set: () => {},
      remove: () => {},
    };

    expect(
      readAndAlignLegacyChapterTranslation({
        cache,
        bookId: "book",
        chapter: 0,
        sourceSegments: [{ id: "whole", html: "<p>source</p>" }],
        targetLanguage: "English",
        cefrLevel: "C2",
        useCefr: false,
      })?.strategy
    ).toBe("whole-chapter");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import { BookReader } from "@features/reader/components/BookReader";

vi.mock("@features/reader/hooks/useBookContent", () => ({
  useBookContent: () => ({
    bookContent: {
      title: "Demo Book",
      totalChapters: 1,
      chapters: ['<p>I went to the park with my dog.</p>'],
      chapterTitles: [{ index: 0, title: "Chapter 1", href: "" }],
    },
    currentChapterContent: "<p>I went to the park with my dog.</p>",
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@features/reader/services/jpdbInitializer", () => ({
  initialize: () => {},
  highlightContent: async () => {},
  removeJpdbHighlighting: () => {},
}));

vi.mock("@features/jpdbMirror/db", () => {
  const meta = { version: 1, syncedAtMs: Date.now(), knownEntryCount: 2, sourceDecks: [] };
  const vocabById = new Map([
    ["1/1", { id: "1/1", vid: 1, sid: 1, spelling: "公園", reading: "こうえん", meanings: ["park"], frequencyRank: 100, cardState: ["known"], dueAtMs: null, updatedAtMs: Date.now() }],
    ["2/2", { id: "2/2", vid: 2, sid: 2, spelling: "犬", reading: "いぬ", meanings: ["dog"], frequencyRank: 120, cardState: ["known"], dueAtMs: null, updatedAtMs: Date.now() }],
  ]);
  const glossIndex = new Map([
    ["park", ["1/1"]],
    ["dog", ["2/2"]],
  ]);
  return {
    getMirrorMeta: async () => meta,
    getKnownVocabAsMap: async () => vocabById,
    getGlossIndexAsMap: async () => glossIndex,
  };
});

describe("Reader integration: mix mode", () => {
  beforeEach(() => {
    // Enable mix mode via SettingsContext localStorage load.
    localStorage.setItem(
      "prSettings",
      JSON.stringify({
        mixEnabled: true,
        mixAggression: 1,
        mixAutoEnableHighlight: false,
        mixBackupMirrorToDrive: false,
        mixMirrorStaleAfterHours: 24,
      })
    );
  });

  afterEach(() => {
    localStorage.removeItem("prSettings");
  });

  it("swaps known nouns into English text", async () => {
    renderWithProviders(<BookReader bookId="demo-1" currentChapter={0} setCurrentChapter={() => {}} onBack={() => {}} />, {
      appDataOverride: {
        books: [{ id: "demo-1", title: "Demo Book", fileType: "epub" }],
      },
    });

    expect(await screen.findByText(/公園/)).toBeInTheDocument();
    expect(await screen.findByText(/犬/)).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { createEnglishSwapHighlighter } from "./englishSwap";
import type { JpdbKnownVocabRecord } from "@features/jpdbMirror/types";

function rec(args: Partial<JpdbKnownVocabRecord> & { id: string; spelling: string }): JpdbKnownVocabRecord {
  return {
    id: args.id as any,
    vid: args.vid ?? 1,
    sid: args.sid ?? 1,
    spelling: args.spelling,
    reading: args.reading,
    meanings: args.meanings ?? [],
    frequencyRank: args.frequencyRank ?? null,
    cardState: args.cardState ?? ["known"],
    dueAtMs: args.dueAtMs ?? null,
    updatedAtMs: args.updatedAtMs ?? Date.now(),
  };
}

describe("englishSwap", () => {
  it("swaps simple known nouns and preserves punctuation", () => {
    const vocabById = new Map<string, JpdbKnownVocabRecord>([
      ["1/1", rec({ id: "1/1", spelling: "犬", frequencyRank: 100 })],
    ]);
    const glossIndex = new Map<string, string[]>([["dog", ["1/1"]]]);

    const h = createEnglishSwapHighlighter({
      bookId: "b1",
      chapter: 0,
      aggression: 1,
      glossIndex,
      vocabById,
    });

    const out = String(h.highlightFn("I love dogs.")[0]);
    expect(out).toBe("I love 犬.");
  });

  it("does not swap possessives (MVP block)", () => {
    const vocabById = new Map<string, JpdbKnownVocabRecord>([
      ["1/1", rec({ id: "1/1", spelling: "犬", frequencyRank: 100 })],
    ]);
    const glossIndex = new Map<string, string[]>([["dog", ["1/1"]]]);

    const h = createEnglishSwapHighlighter({
      bookId: "b1",
      chapter: 0,
      aggression: 1,
      glossIndex,
      vocabById,
    });

    const out = String(h.highlightFn("my dog's leash")[0]);
    expect(out).toBe("my dog's leash");
  });

  it("swaps multi-word phrases (longest-first)", () => {
    const vocabById = new Map<string, JpdbKnownVocabRecord>([
      ["2/2", rec({ id: "2/2", spelling: "駐車場", frequencyRank: 200 })],
    ]);
    const glossIndex = new Map<string, string[]>([["parking lot", ["2/2"]]]);

    const h = createEnglishSwapHighlighter({
      bookId: "b1",
      chapter: 0,
      aggression: 1,
      glossIndex,
      vocabById,
    });

    const out = String(h.highlightFn("The parking lot is full.")[0]);
    expect(out).toBe("The 駐車場 is full.");
  });

  it("is deterministic given the same call order", () => {
    const vocabById = new Map<string, JpdbKnownVocabRecord>([
      ["1/1", rec({ id: "1/1", spelling: "犬", frequencyRank: 100 })],
    ]);
    const glossIndex = new Map<string, string[]>([["dog", ["1/1"]]]);

    const makeRun = () => {
      const h = createEnglishSwapHighlighter({
        bookId: "b1",
        chapter: 3,
        aggression: 0.5,
        glossIndex,
        vocabById,
      });
      return [String(h.highlightFn("dog dog dog")[0]), String(h.highlightFn("dog")[0])];
    };

    expect(makeRun()).toEqual(makeRun());
  });

  it("skips ambiguous glosses and records them", () => {
    const vocabById = new Map<string, JpdbKnownVocabRecord>([
      ["1/1", rec({ id: "1/1", spelling: "銀行", frequencyRank: 1000 })],
      ["2/2", rec({ id: "2/2", spelling: "土手", frequencyRank: 1100 })],
    ]);
    const glossIndex = new Map<string, string[]>([["bank", ["1/1", "2/2"]]]);

    const h = createEnglishSwapHighlighter({
      bookId: "b1",
      chapter: 0,
      aggression: 1,
      glossIndex,
      vocabById,
    });

    const out = String(h.highlightFn("I went to the bank.")[0]);
    expect(out).toBe("I went to the bank.");
    expect(h.getAmbiguousGlosses()).toContain("bank");
  });
});


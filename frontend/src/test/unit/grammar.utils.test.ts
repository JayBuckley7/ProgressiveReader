import { describe, it, expect } from "vitest";

import { buildHints, hintQualityForHints } from "@features/grammar/data/grammarCatalog";
import { splitIntoSentences, limitSentencesByPercent } from "@features/grammar/services/grammarText";
import { mergeAndLimitExamples } from "@features/grammar/services/grammarExamples";
import type { GrammarExample } from "@features/grammar/types";

describe("grammarCatalog.buildHints", () => {
  it("keeps useful Japanese hints and marks common ones as too_common", () => {
    const hints1 = buildHints("ている");
    expect(hints1).toContain("ている");
    expect(hintQualityForHints(hints1)).toBe("ok");

    const hints2 = buildHints("が (ga)");
    expect(hints2.length).toBe(0);
    expect(hintQualityForHints(hints2)).toBe("too_common");
  });
});

describe("grammarText.splitIntoSentences", () => {
  it("splits Japanese punctuation into sentences", () => {
    const s = "今日は雨だ。明日も雨？やだ！";
    expect(splitIntoSentences(s)).toEqual(["今日は雨だ。", "明日も雨？", "やだ！"]);
  });

  it("limits by percent but always returns at least one sentence", () => {
    const sentences = splitIntoSentences("一。二。三。四。五。");
    const limited = limitSentencesByPercent(sentences, 0.01);
    expect(limited.length).toBeGreaterThanOrEqual(1);
  });
});

describe("grammarExamples.mergeAndLimitExamples", () => {
  it("dedupes by id and keeps top N by confidence then recency", () => {
    const base: Omit<GrammarExample, "id" | "confidence" | "createdAt"> = {
      grammarId: "n5:ている",
      grammarTitle: "ている",
      grammarMeaning: "ongoing state",
      grammarLevel: "n5",
      bookId: "b1",
      chapterIndex: 0,
      sentence: "今、食べている。",
      match: { start: 3, end: 6, text: "ている" },
    };

    const existing: GrammarExample[] = [
      { ...base, id: "a", confidence: 0.4, createdAt: "2026-02-01T00:00:00.000Z" },
      { ...base, id: "b", confidence: 0.9, createdAt: "2026-02-02T00:00:00.000Z" },
    ];

    const incoming: GrammarExample[] = [
      // override id=a with higher confidence (dedupe behavior)
      { ...base, id: "a", confidence: 0.8, createdAt: "2026-02-03T00:00:00.000Z" },
      { ...base, id: "c", confidence: 0.7, createdAt: "2026-02-04T00:00:00.000Z" },
      { ...base, id: "d", confidence: 0.6, createdAt: "2026-02-05T00:00:00.000Z" },
    ];

    const merged = mergeAndLimitExamples(existing, incoming, 3);
    expect(merged.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});


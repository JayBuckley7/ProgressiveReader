import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSelectedJpdbDeck,
  getCachedDueSummary,
  loadCachedDueEntries,
  loadSelectedJpdbDeck,
  saveCachedDueEntries,
  saveSelectedJpdbDeck,
} from "@features/vocabulary/services/vocabularyDashboard";

describe("vocabulary dashboard storage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists and clears the selected JPDB deck", () => {
    expect(loadSelectedJpdbDeck()).toBeNull();

    saveSelectedJpdbDeck({ id: "15", name: "Japanese Language Proficiency Test - N2" });
    expect(loadSelectedJpdbDeck()).toEqual({
      id: "15",
      name: "Japanese Language Proficiency Test - N2",
    });

    clearSelectedJpdbDeck();
    expect(loadSelectedJpdbDeck()).toBeNull();
  });

  it("loads cached due-card data while the cache is fresh", () => {
    saveCachedDueEntries("15", [
      { vid: 1, sid: 10, spelling: "語彙" },
      { vid: 2, sid: 11, spelling: "文法" },
    ]);

    expect(loadCachedDueEntries("15")).toHaveLength(2);
    expect(getCachedDueSummary("15")).toEqual({
      deckId: "15",
      count: 2,
      checkedAt: "2026-04-14T12:00:00.000Z",
    });
  });

  it("expires stale due-card cache entries", () => {
    saveCachedDueEntries("15", [{ vid: 1, sid: 10, spelling: "語彙" }]);
    vi.advanceTimersByTime(16 * 60 * 1000);

    expect(loadCachedDueEntries("15")).toBeNull();
    expect(getCachedDueSummary("15")).toBeNull();
  });
});

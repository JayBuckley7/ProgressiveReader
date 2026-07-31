import { describe, expect, it } from "vitest";
import type { ReadingProgress } from "~/types";
import {
  dismissContinueReadingProgress,
  isContinueReadingProgressDismissed,
  readContinueReadingPreferences,
  writeContinueReadingPreferences,
} from "@features/books/utils/continueReadingPreferences";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function progress(lastUpdated: string): ReadingProgress {
  return {
    bookId: "book-1",
    userId: "user-1",
    currentChapter: 3,
    currentPosition: 0,
    lastUpdated: new Date(lastUpdated),
  };
}

describe("Continue Reading preferences", () => {
  it("persists collapse and removal choices per account", () => {
    const storage = memoryStorage();
    const preferences = dismissContinueReadingProgress(
      { collapsed: true, dismissedProgressAt: {} },
      progress("2026-07-30T12:00:00.000Z")
    );

    writeContinueReadingPreferences("user-1", preferences, storage);

    expect(readContinueReadingPreferences("user-1", storage)).toEqual(preferences);
    expect(readContinueReadingPreferences("user-2", storage)).toEqual({
      collapsed: false,
      dismissedProgressAt: {},
    });
  });

  it("shows a removed book again after newer reading progress is saved", () => {
    const dismissed = dismissContinueReadingProgress(
      { collapsed: false, dismissedProgressAt: {} },
      progress("2026-07-30T12:00:00.000Z")
    );

    expect(isContinueReadingProgressDismissed(dismissed, progress("2026-07-30T12:00:00.000Z"))).toBe(true);
    expect(isContinueReadingProgressDismissed(dismissed, progress("2026-07-30T12:00:01.000Z"))).toBe(false);
  });
});

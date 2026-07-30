import { describe, expect, it } from "vitest";
import type { BookMetadata, Folder, ReadingProgress } from "~/types";
import {
  continueReadingBooks,
  filterAndSortBooks,
  readingProgressRatio,
} from "@features/books/utils/libraryView";

const books: BookMetadata[] = [
  {
    id: "older",
    title: "Older Book",
    author: "A. Writer",
    fileType: "epub",
    uploadedAt: new Date("2026-01-01"),
    userId: "u",
    cloudProvider: "google",
    folderId: "fiction",
    totalChapters: 10,
  },
  {
    id: "newer",
    title: "Newer Book",
    fileType: "pdf",
    uploadedAt: new Date("2026-02-01"),
    userId: "u",
    cloudProvider: "google",
  },
];

const folders: Folder[] = [
  {
    id: "fiction",
    name: "Fiction",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "u",
  },
];

const progress: Record<string, ReadingProgress> = {
  older: {
    bookId: "older",
    userId: "u",
    currentChapter: 5,
    currentPosition: 0,
    lastUpdated: new Date("2026-07-30T12:00:00Z"),
  },
  newer: {
    bookId: "newer",
    userId: "u",
    currentChapter: 0,
    currentPosition: 0,
    currentPage: 2,
    totalPages: 10,
    fileType: "pdf",
    lastUpdated: new Date("2026-07-29T12:00:00Z"),
  },
};

describe("library view helpers", () => {
  it("searches titles, authors, and folder names", () => {
    expect(
      filterAndSortBooks({ books, folders, progressByBookId: progress, query: "fiction", sort: "title" })
        .map((book) => book.id)
    ).toEqual(["older"]);
    expect(
      filterAndSortBooks({ books, folders, progressByBookId: progress, query: "writer", sort: "title" })
        .map((book) => book.id)
    ).toEqual(["older"]);
  });

  it("sorts by reading recency and builds the continue list", () => {
    expect(
      filterAndSortBooks({ books, folders, progressByBookId: progress, query: "", sort: "recentlyRead" })
        .map((book) => book.id)
    ).toEqual(["older", "newer"]);
    expect(continueReadingBooks(books, progress).map(({ book }) => book.id)).toEqual(["older", "newer"]);
  });

  it("calculates chapter and PDF progress", () => {
    expect(readingProgressRatio(books[0], progress.older)).toBe(0.5);
    expect(readingProgressRatio(books[1], progress.newer)).toBe(0.2);
  });
});

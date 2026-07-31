import { describe, expect, it } from "vitest";
import type { BookMetadata, Folder } from "~/types";
import { readLibrarySnapshot, writeLibrarySnapshot } from "@features/books/utils/librarySnapshot";

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

const book: BookMetadata = {
  id: "book-1",
  title: "A Book",
  fileType: "epub",
  uploadedAt: new Date("2026-07-20T12:00:00.000Z"),
  userId: "user-1",
  cloudProvider: "google",
  coverUrl: "blob:temporary-cover",
};

const folder: Folder = {
  id: "folder-1",
  name: "Fiction",
  createdAt: new Date("2026-07-19T12:00:00.000Z"),
  updatedAt: new Date("2026-07-21T12:00:00.000Z"),
  userId: "user-1",
};

describe("library snapshot", () => {
  it("round trips metadata and dates without persisting temporary cover URLs", () => {
    const storage = memoryStorage();
    const savedAt = new Date("2026-07-30T15:00:00.000Z");

    writeLibrarySnapshot("user-1", [book], [folder], savedAt, storage);
    const snapshot = readLibrarySnapshot("user-1", storage);

    expect(snapshot?.savedAt).toEqual(savedAt);
    expect(snapshot?.books[0].uploadedAt).toEqual(book.uploadedAt);
    expect(snapshot?.books[0].coverUrl).toBeUndefined();
    expect(snapshot?.folders[0].updatedAt).toEqual(folder.updatedAt);
  });

  it("keeps snapshots isolated by user", () => {
    const storage = memoryStorage();
    writeLibrarySnapshot("user-1", [book], [folder], new Date(), storage);

    expect(readLibrarySnapshot("user-2", storage)).toBeNull();
  });
});

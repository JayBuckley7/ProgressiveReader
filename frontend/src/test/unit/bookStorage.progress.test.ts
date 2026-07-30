import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBookStorageService } from "@features/books/services/bookStorage";
import type { DriveCachePort } from "@core/drive/cachePort";
import type { DrivePort } from "@core/drive/ports";

describe("BookStorageService reading progress", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("fills all local misses with one cloud metadata request", async () => {
    const getMetadataFile = vi.fn(async () => ({
      fileId: "metadata",
      data: {
        progress: {
          one: {
            bookId: "one",
            userId: "user",
            currentChapter: 2,
            currentPosition: 0,
            lastUpdated: "2026-07-30T12:00:00.000Z",
          },
          two: {
            bookId: "two",
            userId: "user",
            currentChapter: 4,
            currentPosition: 0,
            lastUpdated: "2026-07-29T12:00:00.000Z",
          },
        },
      },
    }));
    const drive = {
      isSignedIn: () => true,
      getMetadataFile,
    } as unknown as DrivePort;
    const service = createBookStorageService({
      drive,
      driveCache: {} as DriveCachePort,
    });

    const result = await service.getReadingProgresses(["one", "two"]);

    expect(getMetadataFile).toHaveBeenCalledTimes(1);
    expect(result.one.currentChapter).toBe(2);
    expect(result.two.lastUpdated).toEqual(new Date("2026-07-29T12:00:00.000Z"));
    expect(localStorage.getItem("reading_progress_one")).not.toBeNull();
    expect(localStorage.getItem("reading_progress_two")).not.toBeNull();
  });
});

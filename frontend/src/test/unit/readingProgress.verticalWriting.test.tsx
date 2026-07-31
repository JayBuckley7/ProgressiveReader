import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useReadingProgress } from "@features/reader/hooks/useReadingProgress";

describe("useReadingProgress vertical writing", () => {
  it("stores progress from the right edge and records the horizontal reading extent", async () => {
    const readingSurface = document.createElement("div");
    Object.defineProperty(readingSurface, "scrollWidth", { configurable: true, value: 1200 });
    Object.defineProperty(readingSurface, "clientWidth", { configurable: true, value: 600 });
    readingSurface.scrollLeft = 480;

    const saveBookProgress = vi.fn().mockResolvedValue(undefined);
    const contentRef = { current: readingSurface } as React.RefObject<HTMLDivElement>;

    const { result } = renderHook(() =>
      useReadingProgress({
        bookId: "vertical-book",
        bookMetadata: { fileType: "epub" },
        chapter: 2,
        verticalWriting: true,
        contentRef,
        getReadingProgress: vi.fn().mockResolvedValue(null),
        saveBookProgress,
        setLocalChapter: vi.fn(),
        setPdfCurrentPage: vi.fn(),
        searchParams: new URLSearchParams("ch=2"),
        setSearchParams: vi.fn(),
      })
    );

    await waitFor(() => expect(result.current.progressLoaded).toBe(true));

    act(() => {
      readingSurface.dispatchEvent(new Event("scroll"));
      result.current.saveProgress();
    });

    expect(saveBookProgress).toHaveBeenLastCalledWith(
      "vertical-book",
      2,
      120,
      undefined,
      undefined,
      "epub",
      1200,
      600
    );
  });
});

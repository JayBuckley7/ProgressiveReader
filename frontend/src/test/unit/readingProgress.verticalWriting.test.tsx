import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useReadingProgress } from "@features/reader/hooks/useReadingProgress";

describe("useReadingProgress", () => {
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

  it.each(['pdf', 'cbz'])("puts a restored %s page in the URL", async (fileType) => {
    const setPdfCurrentPage = vi.fn();
    const setSearchParams = vi.fn();

    const { result } = renderHook(() =>
      useReadingProgress({
        bookId: "pdf-book",
        bookMetadata: { fileType },
        chapter: 0,
        contentRef: { current: document.createElement("div") },
        getReadingProgress: vi.fn().mockResolvedValue({ currentPage: 4, locator: { version: 2, kind: fileType, pageNumber: 12 } }),
        saveBookProgress: vi.fn().mockResolvedValue(undefined),
        setLocalChapter: vi.fn(),
        setPdfCurrentPage,
        searchParams: new URLSearchParams(),
        setSearchParams,
      })
    );

    await waitFor(() => expect(result.current.progressLoaded).toBe(true));

    expect(setPdfCurrentPage).toHaveBeenCalledWith(12);
    expect(setSearchParams).toHaveBeenCalledTimes(1);
    const [params, options] = setSearchParams.mock.calls[0];
    expect(params).toBeInstanceOf(URLSearchParams);
    expect(params.get("page")).toBe("12");
    expect(options).toEqual({ replace: true });
  });

  it("persists a stable reflow locator without persisting a visual page number", async () => {
    const readingSurface = document.createElement("div");
    Object.defineProperty(readingSurface, "scrollWidth", { configurable: true, value: 2400 });
    Object.defineProperty(readingSurface, "clientWidth", { configurable: true, value: 800 });
    const locator = {
      version: 2 as const,
      kind: "reflow" as const,
      chapterIndex: 4,
      segmentId: "segment-42",
      textOffset: 17,
      quote: "the same sentence",
      progression: 0.625,
    };
    const saveBookProgress = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useReadingProgress({
        bookId: "reflow-book",
        bookMetadata: { fileType: "epub" },
        chapter: 4,
        contentRef: { current: readingSurface },
        getReadingProgress: vi.fn().mockResolvedValue(null),
        saveBookProgress,
        setLocalChapter: vi.fn(),
        setPdfCurrentPage: vi.fn(),
        searchParams: new URLSearchParams("ch=4"),
        setSearchParams: vi.fn(),
        getCurrentPosition: () => 1600,
        getCurrentLocator: () => locator,
      })
    );

    await waitFor(() => expect(result.current.progressLoaded).toBe(true));
    act(() => result.current.saveProgress());

    expect(saveBookProgress).toHaveBeenLastCalledWith(
      "reflow-book",
      4,
      1600,
      undefined,
      undefined,
      "epub",
      2400,
      800,
      locator
    );
  });

  it("waits for reflow layout before restoring the saved sentence locator", async () => {
    const locator = {
      version: 2 as const,
      kind: "reflow" as const,
      chapterIndex: 2,
      segmentId: "segment-restore",
      textOffset: 9,
      quote: "restore this sentence",
      progression: 0.35,
    };
    const restoreLocator = vi.fn().mockReturnValue(true);
    const restoreLegacyPosition = vi.fn().mockReturnValue(true);
    const setLocalChapter = vi.fn();

    const { result, rerender } = renderHook(
      ({ ready }: { ready: boolean }) =>
        useReadingProgress({
          bookId: "restore-book",
          bookMetadata: { fileType: "epub" },
          chapter: 2,
          contentRef: { current: document.createElement("div") },
          getReadingProgress: vi.fn().mockResolvedValue({
            currentChapter: 2,
            currentPosition: 700,
            locator,
          }),
          saveBookProgress: vi.fn().mockResolvedValue(undefined),
          setLocalChapter,
          setPdfCurrentPage: vi.fn(),
          searchParams: new URLSearchParams(),
          setSearchParams: vi.fn(),
          paginationReady: ready,
          contentChapter: 2,
          restoreLocator,
          restoreLegacyPosition,
          getCurrentPosition: () => 704,
        }),
      { initialProps: { ready: false } }
    );

    await waitFor(() => expect(result.current.progressLoaded).toBe(true));
    expect(setLocalChapter).toHaveBeenCalledWith(2);
    expect(restoreLocator).not.toHaveBeenCalled();

    rerender({ ready: true });
    await waitFor(() => expect(restoreLocator).toHaveBeenCalledWith(locator));
    expect(restoreLegacyPosition).not.toHaveBeenCalled();
    expect(result.current.scrollPositionRef.current).toBe(704);
  });

  it("passes legacy layout bounds to the best-effort reflow restore", async () => {
    const saved = {
      currentChapter: 1,
      currentPosition: 600,
      scrollHeight: 1800,
      viewportHeight: 600,
    };
    const restoreLegacyPosition = vi.fn().mockReturnValue(true);

    const { result } = renderHook(() =>
      useReadingProgress({
        bookId: "legacy-book",
        bookMetadata: { fileType: "epub" },
        chapter: 1,
        contentRef: { current: document.createElement("div") },
        getReadingProgress: vi.fn().mockResolvedValue(saved),
        saveBookProgress: vi.fn().mockResolvedValue(undefined),
        setLocalChapter: vi.fn(),
        setPdfCurrentPage: vi.fn(),
        searchParams: new URLSearchParams(),
        setSearchParams: vi.fn(),
        paginationReady: true,
        contentChapter: 1,
        restoreLegacyPosition,
      })
    );

    await waitFor(() => expect(result.current.progressLoaded).toBe(true));
    await waitFor(() =>
      expect(restoreLegacyPosition).toHaveBeenCalledWith(600, saved)
    );
  });
});

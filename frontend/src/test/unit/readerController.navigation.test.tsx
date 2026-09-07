import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReaderDock } from "@features/reader/components/ReaderDock";
import { useBookReaderController } from "@features/reader/components/bookReader/useBookReaderController";
import type { useReadingProgress } from "@features/reader/hooks/useReadingProgress";
import type { PageTranslationOptions } from "@features/reader/hooks/useTranslation";

const fakes = vi.hoisted(() => ({
  contentChapter: 1 as number | null,
  contentVersion: 0,
  verticalWriting: false,
  navigateToChapter: vi.fn(),
  clearTranslation: vi.fn(),
  setSearchParams: vi.fn(),
  paginationReady: true,
  paginationPageIndex: 0,
  paginationPageCount: 1,
  paginationLayoutRevision: 1,
  paginationCanPrevious: false,
  paginationCanNext: false,
  paginationGoToPage: vi.fn(),
  paginationCurrentSegmentIds: [] as string[],
  paginationNextSegmentIds: [] as string[],
  highlightingArgs: null as null | { currentSegmentIds?: readonly string[]; nextSegmentIds?: readonly string[] },
  paginationCaptureAnchor: vi.fn(() => null as null | { segmentId: string; textOffset: number }),
  readingProgressOptions: null as Parameters<typeof useReadingProgress>[0] | null,
  chapterContent: "<p>chapter</p>",
  translationPageOptions: null as PageTranslationOptions | null,
  bookFileType: "epub",
  bookCoverUrl: "cover-a",
  bookModifiedTime: "version-a",
  downloadBook: vi.fn(),
  progressLoaded: true,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams("ch=1"), fakes.setSearchParams],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "reader.controls.prev": "Previous chapter",
        "reader.controls.next": "Next chapter",
        "reader.controls.prevPage": "Previous page",
        "reader.controls.nextPage": "Next page",
        "reader.controls.toc": "Table of contents and bookmarks",
        "reader.dock.label": "Reader navigation",
        "reader.dock.previous": "Previous",
        "reader.dock.next": "Next",
      })[key] ?? key,
  }),
}));

vi.mock("@shared/contexts/AppDataContext", () => ({
  useAppData: () => ({
    books: [{
      id: "book-1",
      title: "Book",
      fileType: fakes.bookFileType,
      uploadedAt: new Date("2026-01-01T00:00:00Z"),
      userId: "reader",
      cloudProvider: "google",
      driveFileId: "drive-file-1",
      modifiedTime: fakes.bookModifiedTime,
      coverUrl: fakes.bookCoverUrl,
    }],
    downloadBook: fakes.downloadBook,
    getReadingProgress: vi.fn(),
    saveBookProgress: vi.fn(),
  }),
}));

vi.mock("@shared/contexts/SettingsContext", () => ({
  useSettings: () => ({ settings: { verticalWriting: fakes.verticalWriting } }),
}));

vi.mock("@features/reader/pagination", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/reader/pagination")>();
  return {
    ...actual,
    useReflowPagination: () => ({
      pageIndex: fakes.paginationPageIndex,
      pageCount: fakes.paginationPageCount,
      layoutRevision: fakes.paginationLayoutRevision,
      isLayoutReady: fakes.paginationReady,
      canGoPrevious: fakes.paginationCanPrevious,
      canGoNext: fakes.paginationCanNext,
      visibleSegmentIds: [],
      currentSegmentIds: fakes.paginationCurrentSegmentIds,
      nextSegmentIds: fakes.paginationNextSegmentIds,
      goToPage: fakes.paginationGoToPage,
      nextPage: vi.fn(),
      previousPage: vi.fn(),
      reflow: vi.fn(),
      captureAnchor: fakes.paginationCaptureAnchor,
      restoreAnchor: vi.fn(),
    }),
  };
});

vi.mock("@features/reader/hooks/useBookContent", () => ({
  useBookContent: () => ({
    bookContent: {
      title: "Book",
      totalChapters: 3,
      chapters: ["one", "two", "three"],
      chapterTitles: [
        { index: 0, title: "One", href: "one.xhtml" },
        { index: 1, title: "Two", href: "two.xhtml" },
        { index: 2, title: "Three", href: "three.xhtml" },
      ],
    },
    currentChapterContent: fakes.chapterContent,
    currentChapterContentChapter: fakes.contentChapter,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@features/reader/hooks/useReadingProgress", () => ({
  useReadingProgress: (options: unknown) => {
    fakes.readingProgressOptions = options;
    return ({
      progressLoaded: fakes.progressLoaded,
      navigateToChapter: fakes.navigateToChapter,
    });
  },
}));

vi.mock("@features/reader/hooks/useSwipe", () => ({ useSwipe: vi.fn() }));
vi.mock("@features/reader/hooks/useTextToSpeech", () => ({
  useTextToSpeech: () => ({}),
}));
vi.mock("@features/reader/hooks/useTranslation", () => ({
  useTranslation: (
    _bookId: string,
    _chapter: number,
    _content: string | null,
    pageOptions?: PageTranslationOptions
  ) => {
    fakes.translationPageOptions = pageOptions ?? null;
    return {
      translateCurrent: vi.fn(),
      isTranslating: false,
      isTranslated: false,
      translatedContent: null,
      clearTranslation: fakes.clearTranslation,
      applyStoredTranslation: vi.fn(),
      isAutoloaded: false,
      lastUseCefr: false,
      setLastUseCefr: vi.fn(),
    };
  },
}));
vi.mock("@features/grammar/hooks/useGrammarReadAlong", () => ({
  useGrammarReadAlong: vi.fn(),
}));
vi.mock("@features/reader/components/bookReader/useInternalEpubLinks", () => ({
  useInternalEpubLinks: vi.fn(),
}));
vi.mock("@features/reader/components/bookReader/useJpdbHighlighting", () => ({
  useJpdbHighlighting: (args: { currentSegmentIds?: readonly string[]; nextSegmentIds?: readonly string[] }) => {
    fakes.highlightingArgs = args;
    return {
      jpdbHighlighted: false,
      toggleJpdbHighlight: vi.fn(),
      setJpdbHighlighted: vi.fn(),
    };
  },
}));
vi.mock("@features/reader/components/bookReader/useMixModeContent", () => ({
  useMixModeContent: () => ({
    contentVersion: fakes.contentVersion,
    getSegmentContentIdentity: (ids: readonly string[]) => ids.join("|"),
  }),
}));

const controllerProps = {
  bookId: "book-1",
  openAiKeyRefreshSignal: null,
};

function NavigationHarness() {
  const controller = useBookReaderController({
    ...controllerProps,
    currentChapter: 1,
    setCurrentChapter: fakes.navigateToChapter,
  });

  return (
    <ReaderDock
      currentIndex={controller.chapter}
      totalItems={controller.bookContent?.totalChapters ?? 1}
      onPrevious={controller.nav.previousPage}
      onNext={controller.nav.nextPage}
      canPrevious={controller.nav.canPrevious}
      canNext={controller.nav.canNext}
      onShowContents={() => {}}
    />
  );
}

function WheelNavigationHarness() {
  const controller = useBookReaderController({
    ...controllerProps,
    currentChapter: 1,
    setCurrentChapter: fakes.navigateToChapter,
  });

  return (
    <div ref={controller.contentRef} data-testid="reader-surface">
      <pre data-testid="wide-code">wide content</pre>
    </div>
  );
}

describe("useBookReaderController navigation", () => {
  beforeEach(() => {
    fakes.contentChapter = 1;
    fakes.contentVersion = 0;
    fakes.verticalWriting = false;
    fakes.navigateToChapter.mockReset();
    fakes.clearTranslation.mockReset();
    fakes.setSearchParams.mockReset();
    fakes.paginationReady = true;
    fakes.paginationPageIndex = 0;
    fakes.paginationPageCount = 1;
    fakes.paginationLayoutRevision = 1;
    fakes.paginationCanPrevious = false;
    fakes.paginationCanNext = false;
    fakes.paginationGoToPage.mockReset();
    fakes.paginationCurrentSegmentIds = [];
    fakes.paginationNextSegmentIds = [];
    fakes.highlightingArgs = null;
    fakes.paginationCaptureAnchor.mockReset();
    fakes.paginationCaptureAnchor.mockReturnValue(null);
    fakes.readingProgressOptions = null;
    fakes.chapterContent = "<p>chapter</p>";
    fakes.translationPageOptions = null;
    fakes.bookFileType = "epub";
    fakes.bookCoverUrl = "cover-a";
    fakes.bookModifiedTime = "version-a";
    fakes.downloadBook.mockReset();
    fakes.progressLoaded = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll("[data-jpdb-popup]").forEach((element) => element.remove());
  });

  it("keeps arrow navigation active after a dock button click and pauses it for a JPDB popup", () => {
    render(<NavigationHarness />);
    const nextButton = screen.getByRole("button", { name: "Next chapter" });

    nextButton.focus();
    fireEvent.click(nextButton);
    fireEvent.keyDown(nextButton, { key: "ArrowRight" });

    expect(fakes.navigateToChapter).toHaveBeenNthCalledWith(1, 2);
    expect(fakes.navigateToChapter).toHaveBeenNthCalledWith(2, 2);

    const popup = document.createElement("div");
    popup.dataset.jpdbPopup = "";
    document.body.appendChild(popup);
    fireEvent.keyDown(nextButton, { key: "ArrowRight" });

    expect(fakes.navigateToChapter).toHaveBeenCalledTimes(2);
  });

  it("returns a non-negative integer bookmark position", () => {
    fakes.paginationReady = false;
    const { result } = renderHook(() =>
      useBookReaderController({ ...controllerProps, currentChapter: 1 })
    );
    const readingSurface = document.createElement("div");
    readingSurface.scrollTop = 47.6;
    result.current.contentRef.current = readingSurface;

    expect(result.current.nav.getCurrentReadingPosition()).toBe(48);
  });

  it("waits for the target chapter content before restoring a cross-chapter bookmark", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ currentChapter }) =>
        useBookReaderController({ ...controllerProps, currentChapter }),
      { initialProps: { currentChapter: 1 } }
    );
    const readingSurface = document.createElement("div");
    readingSurface.scrollTop = 9;
    result.current.contentRef.current = readingSurface;

    act(() => result.current.nav.navigateToBookmark(2, 147.6));
    expect(fakes.navigateToChapter).toHaveBeenCalledWith(2);

    rerender({ currentChapter: 2 });
    act(() => vi.runOnlyPendingTimers());
    expect(readingSurface.scrollTop).toBe(9);

    fakes.contentChapter = 2;
    rerender({ currentChapter: 2 });
    act(() => vi.runOnlyPendingTimers());
    expect(readingSurface.scrollTop).toBe(147.6);
  });

  it("waits for settled geometry before restoring a locatorless bookmark", () => {
    vi.useFakeTimers();
    fakes.paginationReady = false;
    const { result, rerender } = renderHook(
      ({ currentChapter }) =>
        useBookReaderController({ ...controllerProps, currentChapter }),
      { initialProps: { currentChapter: 1 } }
    );
    const readingSurface = document.createElement("div");
    readingSurface.scrollTop = 11;
    result.current.contentRef.current = readingSurface;

    act(() => result.current.nav.navigateToBookmark(2, 220));
    fakes.contentChapter = 2;
    rerender({ currentChapter: 2 });
    act(() => vi.runOnlyPendingTimers());
    expect(readingSurface.scrollTop).toBe(11);

    fakes.paginationReady = true;
    rerender({ currentChapter: 2 });
    act(() => vi.runOnlyPendingTimers());
    expect(readingSurface.scrollTop).toBe(220);
  });

  it("handles same-chapter navigation immediately without leaving a latent landing", () => {
    fakes.paginationPageCount = 4;
    const { result, rerender } = renderHook(() =>
      useBookReaderController({ ...controllerProps, currentChapter: 1 })
    );

    act(() => result.current.nav.updateChapter(1));
    expect(fakes.navigateToChapter).not.toHaveBeenCalled();
    expect(fakes.paginationGoToPage).toHaveBeenCalledWith(0);

    fakes.paginationGoToPage.mockClear();
    fakes.contentVersion += 1;
    rerender();
    expect(fakes.paginationGoToPage).not.toHaveBeenCalled();
  });

  it("normalizes legacy scroll bounds onto the new dynamic page count", () => {
    fakes.paginationPageCount = 5;
    const { result } = renderHook(() =>
      useBookReaderController({ ...controllerProps, currentChapter: 1 })
    );
    const readingSurface = document.createElement("div");
    Object.defineProperty(readingSurface, "clientWidth", {
      configurable: true,
      value: 800,
    });
    result.current.contentRef.current = readingSurface;

    const restored = fakes.readingProgressOptions?.restoreLegacyPosition?.(600, {
      scrollHeight: 1800,
      viewportHeight: 600,
    });

    expect(restored).toBe(true);
    expect(fakes.paginationGoToPage).toHaveBeenCalledWith(2);
  });

  it("captures honest page progression for an unaligned legacy translation", () => {
    fakes.paginationPageIndex = 2;
    fakes.paginationPageCount = 5;
    fakes.paginationCaptureAnchor.mockReturnValue({
      segmentId: "legacy-segment",
      textOffset: 8,
    });
    const { result } = renderHook(() =>
      useBookReaderController({ ...controllerProps, currentChapter: 1 })
    );
    const renderedLegacy = document.createElement("div");
    renderedLegacy.innerHTML = [
      '<section data-pr-segment-id="legacy-segment">',
      "A translated sentence used for quote context.",
      "</section>",
    ].join("");
    result.current.flowRef.current = renderedLegacy;

    const locator = result.current.nav.getCurrentReadingLocator();

    expect(locator).toMatchObject({
      kind: "reflow",
      segmentId: "legacy-segment",
      textOffset: 8,
      progression: 0.5,
    });
    expect(locator?.kind === "reflow" ? locator.quote : undefined).toContain("translated");
  });

  it("keeps oversized source-only roots out of translation requests while retaining neighbors", () => {
    fakes.chapterContent = [
      `<pre>${"x".repeat(2_000)}</pre>`,
      "<section><p>Translate this neighbor.</p></section>",
    ].join("");

    renderHook(() => useBookReaderController({ ...controllerProps, currentChapter: 1 }));

    expect(fakes.translationPageOptions).not.toBeNull();
    expect(fakes.translationPageOptions?.segments).toHaveLength(1);
    expect(fakes.translationPageOptions?.segments[0].html).toContain(
      "Translate this neighbor."
    );
    expect(fakes.translationPageOptions?.annotatedHtml).toContain("<pre");
    expect(fakes.translationPageOptions?.annotatedHtml).toContain(
      'data-pr-translation-policy="source-only-oversize"'
    );
  });

  it("turns exactly one page for an entire trackpad momentum gesture", () => {
    render(<WheelNavigationHarness />);
    const surface = screen.getByTestId("reader-surface");
    const wheels = [64, 48, 26, 12].map((deltaX) =>
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX,
        deltaY: 4,
      })
    );

    wheels.forEach((wheel) => surface.dispatchEvent(wheel));

    expect(wheels.every((wheel) => wheel.defaultPrevented)).toBe(true);
    expect(fakes.navigateToChapter).toHaveBeenCalledOnce();
    expect(fakes.navigateToChapter).toHaveBeenCalledWith(2);
  });

  it("accumulates a subtle trackpad gesture before turning one page", () => {
    render(<WheelNavigationHarness />);
    const surface = screen.getByTestId("reader-surface");

    [8, 10, 16].forEach((deltaY) => {
      surface.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 0,
        deltaY,
      }));
    });

    expect(fakes.navigateToChapter).toHaveBeenCalledOnce();
    expect(fakes.navigateToChapter).toHaveBeenCalledWith(2);
  });

  it("does not cross a chapter boundary while new page geometry is unready", () => {
    fakes.paginationReady = false;
    render(<NavigationHarness />);
    const nextButton = screen.getByRole("button", { name: "Next chapter" });

    expect(nextButton).toBeDisabled();
    fireEvent.click(nextButton);
    fireEvent.keyDown(nextButton, { key: "ArrowRight" });

    expect(fakes.navigateToChapter).not.toHaveBeenCalled();
  });

  it("keeps the last settled highlight window while JPDB DOM changes are remeasured", async () => {
    fakes.paginationCurrentSegmentIds = ["visible-segment"];
    fakes.paginationNextSegmentIds = ["lookahead-segment"];
    const { rerender } = renderHook(() =>
      useBookReaderController({ ...controllerProps, currentChapter: 1 })
    );

    await waitFor(() =>
      expect(fakes.highlightingArgs?.currentSegmentIds).toEqual(["visible-segment"])
    );

    // useReflowPagination exposes empty arrays while its MutationObserver is
    // measuring JPDB's wrapper mutations. They must not clear the highlights.
    fakes.paginationReady = false;
    fakes.paginationCurrentSegmentIds = [];
    fakes.paginationNextSegmentIds = [];
    rerender();

    expect(fakes.highlightingArgs?.currentSegmentIds).toEqual(["visible-segment"]);
    expect(fakes.highlightingArgs?.nextSegmentIds).toEqual(["lookahead-segment"]);
  });

  it("turns to the next right-to-left page for a downward wheel gesture", () => {
    fakes.verticalWriting = true;
    render(<WheelNavigationHarness />);
    const surface = screen.getByTestId("reader-surface");
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 0,
      deltaY: 120,
    });

    surface.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(fakes.navigateToChapter).toHaveBeenCalledOnce();
    expect(fakes.navigateToChapter).toHaveBeenCalledWith(2);
  });

  it("lets an oversized preformatted block consume wheel movement before paging", () => {
    render(<WheelNavigationHarness />);
    const code = screen.getByTestId("wide-code");
    Object.defineProperties(code, {
      clientWidth: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 300 },
      scrollLeft: { configurable: true, writable: true, value: 40 },
    });
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 64,
      deltaY: 4,
    });

    code.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
    expect(fakes.navigateToChapter).not.toHaveBeenCalled();
  });

  it("lets vertically overflowing content consume a vertical-writing wheel gesture", () => {
    fakes.verticalWriting = true;
    render(<WheelNavigationHarness />);
    const code = screen.getByTestId("wide-code");
    Object.defineProperties(code, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, writable: true, value: 40 },
    });
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 0,
      deltaY: 120,
    });

    code.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
    expect(fakes.navigateToChapter).not.toHaveBeenCalled();
  });

  it("turns rejected and empty PDF downloads into retryable errors", async () => {
    fakes.bookFileType = "pdf";
    const loadedBytes = new Uint8Array([37, 80, 68, 70]).buffer;
    fakes.downloadBook
      .mockRejectedValueOnce(new Error("PDF network failure"))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        arrayBuffer: vi.fn().mockResolvedValue(loadedBytes),
      });

    const { result } = renderHook(() => useBookReaderController(controllerProps));

    await waitFor(() => expect(result.current.pdf.loadError).toBe("PDF network failure"));
    expect(result.current.pdf.data).toBeNull();

    act(() => result.current.pdf.retryLoad());
    await waitFor(() =>
      expect(result.current.pdf.loadError).toBe("The PDF could not be downloaded.")
    );
    expect(result.current.pdf.data).toBeNull();

    act(() => result.current.pdf.retryLoad());
    await waitFor(() => expect(result.current.pdf.data).toBe(loadedBytes));
    expect(result.current.pdf.loadError).toBeNull();
    expect(fakes.downloadBook).toHaveBeenCalledTimes(3);
  });

  it("does not reload PDF bytes for unrelated metadata churn", async () => {
    fakes.bookFileType = "pdf";
    const firstBytes = new Uint8Array([1]).buffer;
    const updatedBytes = new Uint8Array([2]).buffer;
    let resolveFirstDownload!: (blob: {
      arrayBuffer: () => Promise<ArrayBuffer>;
    }) => void;
    const firstDownload = new Promise<{
      arrayBuffer: () => Promise<ArrayBuffer>;
    }>((resolve) => {
      resolveFirstDownload = resolve;
    });
    fakes.downloadBook
      .mockReturnValueOnce(firstDownload)
      .mockResolvedValueOnce({ arrayBuffer: vi.fn().mockResolvedValue(updatedBytes) });

    const { result, rerender } = renderHook(() => useBookReaderController(controllerProps));
    await waitFor(() => expect(fakes.downloadBook).toHaveBeenCalledOnce());

    fakes.bookCoverUrl = "cover-b";
    await act(async () => {
      rerender();
      await Promise.resolve();
    });
    expect(fakes.downloadBook).toHaveBeenCalledTimes(1);

    resolveFirstDownload({ arrayBuffer: async () => firstBytes });
    await waitFor(() => expect(result.current.pdf.data).toBe(firstBytes));
    expect(result.current.pdf.data).toBe(firstBytes);

    fakes.bookModifiedTime = "version-b";
    rerender();
    await waitFor(() => expect(result.current.pdf.data).toBe(updatedBytes));
    expect(fakes.downloadBook).toHaveBeenCalledTimes(2);
    expect(fakes.downloadBook.mock.calls[1]?.[1]).toMatchObject({
      modifiedTime: "version-b",
    });
  });
});

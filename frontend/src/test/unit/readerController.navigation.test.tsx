import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReaderDock } from "@features/reader/components/ReaderDock";
import { useBookReaderController } from "@features/reader/components/bookReader/useBookReaderController";

const fakes = vi.hoisted(() => ({
  contentChapter: 1 as number | null,
  contentVersion: 0,
  navigateToChapter: vi.fn(),
  clearTranslation: vi.fn(),
  setSearchParams: vi.fn(),
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
    books: [{ id: "book-1", title: "Book", fileType: "epub" }],
    downloadBook: vi.fn(),
    getReadingProgress: vi.fn(),
    saveBookProgress: vi.fn(),
  }),
}));

vi.mock("@shared/contexts/SettingsContext", () => ({
  useSettings: () => ({ settings: { verticalWriting: false } }),
}));

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
    currentChapterContent: "<p>chapter</p>",
    currentChapterContentChapter: fakes.contentChapter,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@features/reader/hooks/useReadingProgress", () => ({
  useReadingProgress: () => ({
    progressLoaded: true,
    navigateToChapter: fakes.navigateToChapter,
  }),
}));

vi.mock("@features/reader/hooks/useSwipe", () => ({ useSwipe: vi.fn() }));
vi.mock("@features/reader/hooks/useTextToSpeech", () => ({
  useTextToSpeech: () => ({}),
}));
vi.mock("@features/reader/hooks/useTranslation", () => ({
  useTranslation: () => ({
    translateCurrent: vi.fn(),
    isTranslating: false,
    isTranslated: false,
    translatedContent: null,
    clearTranslation: fakes.clearTranslation,
    applyStoredTranslation: vi.fn(),
    isAutoloaded: false,
    lastUseCefr: false,
    setLastUseCefr: vi.fn(),
  }),
}));
vi.mock("@features/grammar/hooks/useGrammarReadAlong", () => ({
  useGrammarReadAlong: vi.fn(),
}));
vi.mock("@features/reader/components/bookReader/useInternalEpubLinks", () => ({
  useInternalEpubLinks: vi.fn(),
}));
vi.mock("@features/reader/components/bookReader/useJpdbHighlighting", () => ({
  useJpdbHighlighting: () => ({}),
}));
vi.mock("@features/reader/components/bookReader/useMixModeContent", () => ({
  useMixModeContent: () => ({ contentVersion: fakes.contentVersion }),
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
      onPrevious={controller.nav.prevChapter}
      onNext={controller.nav.nextChapter}
      onShowContents={() => {}}
    />
  );
}

describe("useBookReaderController navigation", () => {
  beforeEach(() => {
    fakes.contentChapter = 1;
    fakes.contentVersion = 0;
    fakes.navigateToChapter.mockReset();
    fakes.clearTranslation.mockReset();
    fakes.setSearchParams.mockReset();
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
});

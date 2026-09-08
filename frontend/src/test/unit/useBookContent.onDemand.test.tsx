import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBookContent } from "@features/reader/hooks/useBookContent";

const fakes = vi.hoisted(() => {
  const getChapterHtml = vi.fn(async (chapter: number) => `<p>chapter ${chapter}</p>`);
  const processor = {
    loadBook: vi.fn(async () => true),
    getTotalChapters: vi.fn(() => 4),
    getChapterTitles: vi.fn(async () =>
      Array.from({ length: 4 }, (_, index) => ({
        index,
        title: `Chapter ${index + 1}`,
        href: `chapter-${index}.xhtml`,
      }))
    ),
    getChapterHtml,
  };
  return {
    fileType: "epub",
    getChapterHtml,
    processor,
    downloadBook: vi.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  };
});

vi.mock("@shared/contexts/AppDataContext", () => ({
  useAppData: () => ({
    books: [{ id: "book-1", title: "On demand", fileType: fakes.fileType }],
    downloadBook: fakes.downloadBook,
    isLoading: false,
  }),
}));

vi.mock("@shared/lib/epubProcessor.ts", () => ({
  EpubProcessorWrapper: vi.fn(function EpubProcessorWrapper() {
    return fakes.processor;
  }),
}));

vi.mock("@shared/lib/textProcessor.ts", () => ({
  TextProcessorWrapper: vi.fn(function TextProcessorWrapper() {
    return fakes.processor;
  }),
}));

vi.mock("@shared/appLog", () => ({
  appLog: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("useBookContent on-demand chapters", () => {
  beforeEach(() => {
    fakes.fileType = "epub";
    fakes.downloadBook.mockClear();
    fakes.getChapterHtml.mockClear();
    fakes.processor.loadBook.mockClear();
    fakes.processor.getTotalChapters.mockClear();
    fakes.processor.getChapterTitles.mockClear();
  });

  it("loads only the requested chapter and fetches the next chapter after navigation", async () => {
    const { result, rerender } = renderHook(
      ({ chapter }: { chapter: number }) => useBookContent("book-1", chapter),
      { initialProps: { chapter: 1 } }
    );

    await waitFor(() => expect(result.current.currentChapterContent).toBe("<p>chapter 1</p>"));
    expect(result.current.bookContent?.totalChapters).toBe(4);
    expect(result.current.bookContent?.chapters).toEqual([]);
    expect(fakes.getChapterHtml).toHaveBeenCalledTimes(1);
    expect(fakes.getChapterHtml).toHaveBeenLastCalledWith(1);

    rerender({ chapter: 2 });
    await waitFor(() => expect(result.current.currentChapterContent).toBe("<p>chapter 2</p>"));

    expect(fakes.getChapterHtml).toHaveBeenCalledTimes(2);
    expect(fakes.getChapterHtml).toHaveBeenLastCalledWith(2);
    expect(fakes.getChapterHtml).not.toHaveBeenCalledWith(0);
    expect(fakes.getChapterHtml).not.toHaveBeenCalledWith(3);
  });

  it("leaves PDFs to the physical-page viewer without a duplicate whole-document parse", async () => {
    fakes.fileType = "pdf";

    const { result } = renderHook(() => useBookContent("book-1", 0));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bookContent).toMatchObject({
      title: "On demand",
      totalChapters: 1,
      chapters: [],
    });
    expect(result.current.currentChapterContent).toBeNull();
    expect(fakes.downloadBook).not.toHaveBeenCalled();
    expect(fakes.processor.loadBook).not.toHaveBeenCalled();
    expect(fakes.getChapterHtml).not.toHaveBeenCalled();
  });
});

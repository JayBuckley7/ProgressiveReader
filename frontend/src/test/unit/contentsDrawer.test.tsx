import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ContentsDrawer from "@features/reader/components/ContentsDrawer";
import type { Bookmark } from "~/types/api";
import { renderWithProviders } from "../test-utils";

const chapters = [
  { index: 0, title: "Prologue", href: "prologue.xhtml" },
  { index: 1, title: "The Pillow of Grass", href: "chapter-1.xhtml" },
];

const bookmark: Bookmark = {
  id: "bookmark-1",
  bookId: "book-1",
  chapterIndex: 1,
  position: 240,
  createdAt: new Date("2026-09-05T00:00:00.000Z"),
  note: "Continue here",
};

describe("ContentsDrawer", () => {
  it("renders real chapter titles and selects a chapter", () => {
    const onClose = vi.fn();
    const onSelectChapter = vi.fn();

    renderWithProviders(
      <ContentsDrawer
        visible
        onClose={onClose}
        chapterTitles={chapters}
        currentChapter={0}
        onSelectChapter={onSelectChapter}
        bookmarks={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "The Pillow of Grass" }));

    expect(onSelectChapter).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("invokes the bookmark callback with the selected bookmark", () => {
    const onClose = vi.fn();
    const onSelectBookmark = vi.fn();

    renderWithProviders(
      <ContentsDrawer
        visible
        onClose={onClose}
        chapterTitles={chapters}
        currentChapter={0}
        onSelectChapter={() => {}}
        onSelectBookmark={onSelectBookmark}
        bookmarks={[bookmark]}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Bookmarks" }));
    fireEvent.click(screen.getByRole("button", { name: /The Pillow of Grass.*Continue here/ }));

    expect(onSelectBookmark).toHaveBeenCalledWith(bookmark);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("falls back to chapter selection when no bookmark callback is supplied", () => {
    const onSelectChapter = vi.fn();

    renderWithProviders(
      <ContentsDrawer
        visible
        onClose={() => {}}
        chapterTitles={chapters}
        currentChapter={0}
        onSelectChapter={onSelectChapter}
        bookmarks={[bookmark]}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Bookmarks" }));
    fireEvent.click(screen.getByRole("button", { name: /The Pillow of Grass.*Continue here/ }));

    expect(onSelectChapter).toHaveBeenCalledWith(1);
  });
});

import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
  it("removes the closed drawer and its controls from the accessibility tree", () => {
    renderWithProviders(
      <ContentsDrawer
        visible={false}
        onClose={() => undefined}
        chapterTitles={chapters}
        currentChapter={0}
        onSelectChapter={() => undefined}
        bookmarks={[]}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Close/ })).not.toBeInTheDocument();

    const closedDrawer = screen.getByRole("dialog", { hidden: true });
    expect(closedDrawer).toHaveAttribute("aria-hidden", "true");
    expect(closedDrawer).toHaveAttribute("inert");
    expect(closedDrawer).not.toHaveAttribute("aria-modal");
  });

  it("takes focus, closes on Escape, and restores the trigger", async () => {
    function Harness() {
      const [visible, setVisible] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setVisible(true)}>Open contents</button>
          {visible && (
            <ContentsDrawer
              visible
              onClose={() => setVisible(false)}
              chapterTitles={chapters}
              currentChapter={0}
              onSelectChapter={() => undefined}
              bookmarks={[]}
            />
          )}
        </>
      );
    }

    renderWithProviders(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open contents" });
    trigger.focus();
    fireEvent.click(trigger);
    const close = await screen.findByRole("button", { name: /Close/ });
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

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

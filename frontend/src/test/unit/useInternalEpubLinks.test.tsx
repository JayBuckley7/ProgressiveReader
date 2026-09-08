import { useRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useInternalEpubLinks } from "@features/reader/components/bookReader/useInternalEpubLinks";

function Harness(props: {
  navigateToChapter: (chapterIndex: number, fragmentId?: string) => void;
  revealElement: (element: HTMLElement) => boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  useInternalEpubLinks({
    bookId: "book-links",
    isPdf: false,
    currentChapter: 0,
    renderedChapter: 0,
    contentRef,
    bookContent: {
      totalChapters: 2,
      chapterTitles: [
        { index: 0, href: "one.xhtml" },
        { index: 1, href: "two.xhtml" },
      ],
    },
    navigateToChapter: props.navigateToChapter,
    revealElement: props.revealElement,
  });
  return (
    <div ref={contentRef}>
      <a href="#late%20target">Same chapter</a>
      <a href="two.xhtml#section%202">Other chapter</a>
      <div id="late target">Target</div>
    </div>
  );
}

describe("useInternalEpubLinks", () => {
  it("reveals same-chapter targets and carries decoded fragments across chapters", async () => {
    const navigateToChapter = vi.fn();
    const revealElement = vi.fn(() => true);
    render(
      <Harness
        navigateToChapter={navigateToChapter}
        revealElement={revealElement}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Same chapter" }));
    await waitFor(() => expect(revealElement).toHaveBeenCalledTimes(1));
    expect(revealElement.mock.calls[0][0]).toHaveAttribute("id", "late target");
    expect(navigateToChapter).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "Other chapter" }));
    expect(navigateToChapter).toHaveBeenCalledWith(1, "section 2");
  });
});

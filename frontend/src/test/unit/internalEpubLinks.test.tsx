import { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInternalEpubLinks } from "@features/reader/components/bookReader/useInternalEpubLinks";

const bookContent = { totalChapters: 3, chapterTitles: [
  { index: 0, href: "Text/toc.xhtml" },
  { index: 1, href: "Text/p-006.xhtml" },
  { index: 2, href: "Other/p-006.xhtml" },
] };
function Reader({ loading, navigate, chapter = 0 }: { loading: boolean; navigate: (n: number) => void; chapter?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useInternalEpubLinks({ bookId: "book", isPdf: false, contentRef: ref, bookContent, currentChapter: chapter, renderedChapter: chapter, navigateToChapter: navigate });
  return loading ? <p>Loading</p> : <div ref={ref}>
    {chapter === 0 ? <><a href="p-006.xhtml#part:6">Chapter six</a><a href="https://example.com/info.html">External</a></> : <h2 id="part:6">Target</h2>}
  </div>;
}
describe("EPUB links", () => {
  it("binds after loading, resolves relative paths without guessing numbers, and restores fragments", () => {
    const navigate = vi.fn();
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const view = render(<Reader loading navigate={navigate} />);
      view.rerender(<Reader loading={false} navigate={navigate} />);
      fireEvent.click(screen.getByText("Chapter six"));
      expect(navigate).toHaveBeenCalledWith(1);
      view.rerender(<Reader loading={false} chapter={1} navigate={navigate} />);
      expect(scroll).toHaveBeenCalled();
    } finally { HTMLElement.prototype.scrollIntoView = original; }
  });
  it("leaves external html links to the browser", () => {
    const navigate = vi.fn();
    render(<Reader loading={false} navigate={navigate} />);
    const link = screen.getByText("External");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

import { createRef } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BookContent } from "@features/reader/components/BookContent";
import type { BookMetadata } from "~/types";
import { renderWithProviders } from "../test-utils";

const metadata: BookMetadata = {
  id: "vertical-book",
  title: "縦書きの本",
  fileType: "epub",
  uploadedAt: new Date("2026-01-01T00:00:00Z"),
  userId: "reader",
  cloudProvider: "local",
};

vi.mock('@features/reader/comic/CbzViewer', () => ({
  CbzViewer: ({ currentPage }: { currentPage: number }) => <div>Comic reader page {currentPage}</div>,
}));

describe("BookContent vertical writing", () => {
  it('routes original CBZ bytes to the comic reader instead of the PDF or text renderer', async () => {
    renderWithProviders(<BookContent bookMetadata={{ ...metadata, fileType: 'cbz' }} contentRef={createRef()} flowRef={createRef()}
      jsxContent={<p>Wrong renderer</p>} error={null} isLoading={false} pdfData={new ArrayBuffer(4)}
      pdfViewerRef={createRef()} pdfCurrentPage={3} setPdfCurrentPage={vi.fn()} setPdfPageCount={vi.fn()}
      settings={{ verticalWriting: true }} />);
    expect(await screen.findByText('Comic reader page 3')).toBeInTheDocument();
    expect(screen.queryByText('Wrong renderer')).toBeNull();
  });
  it("lays out Japanese text top-to-bottom and leaves wheel navigation to the reader controller", () => {
    const contentRef = createRef<HTMLDivElement>();
    const flowRef = createRef<HTMLDivElement>();

    const { container } = renderWithProviders(
      <BookContent
        bookMetadata={metadata}
        contentRef={contentRef}
        flowRef={flowRef}
        jsxContent={<p>縦書きの本文</p>}
        error={null}
        isLoading={false}
        pdfData={null}
        pdfViewerRef={createRef()}
        pdfCurrentPage={1}
        setPdfCurrentPage={vi.fn()}
        setPdfPageCount={vi.fn()}
        settings={{ verticalWriting: true }}
      />
    );

    const readingSurface = container.querySelector<HTMLElement>('[data-writing-mode="vertical-rl"]');
    expect(readingSurface).not.toBeNull();
    expect(screen.getByText("縦書きの本文").parentElement).toHaveClass("reader-vertical-writing");

    Object.defineProperty(readingSurface!, "scrollWidth", { configurable: true, value: 1200 });
    Object.defineProperty(readingSurface!, "clientWidth", { configurable: true, value: 600 });
    readingSurface!.scrollLeft = 600;

    const wheelWasNotCancelled = fireEvent.wheel(readingSurface!, { deltaX: 0, deltaY: 120 });

    expect(wheelWasNotCancelled).toBe(true);
    expect(readingSurface!.scrollLeft).toBe(600);
  });

  it.each(['pdf', 'cbz'])("shows a retry action when loading %s bytes fails", (fileType) => {
    const retry = vi.fn();
    const pdfMetadata: BookMetadata = { ...metadata, fileType };

    renderWithProviders(
      <BookContent
        bookMetadata={pdfMetadata}
        contentRef={createRef()}
        flowRef={createRef()}
        jsxContent={null}
        error={null}
        isLoading={false}
        pdfData={null}
        pdfLoadError="PDF network failure"
        onRetryPdfLoad={retry}
        pdfViewerRef={createRef()}
        pdfCurrentPage={1}
        setPdfCurrentPage={vi.fn()}
        setPdfPageCount={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("PDF network failure");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

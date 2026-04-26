import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PdfViewer } from "@shared/components/PdfViewer";

const getDocumentMock = vi.fn();

vi.mock("@shared/lib/pdfjs", () => ({
  getPdfJs: () => ({
    getDocument: getDocumentMock,
  }),
}));

vi.mock("@features/reader/pdfOverlay/PdfPageCanvas", () => ({
  PdfPageCanvas: ({ pageNumber }: { pageNumber: number }) => (
    <div data-testid="pdf-page-canvas">page {pageNumber}</div>
  ),
}));

describe("PdfViewer", () => {
  it("does not reload the PDF document when only the current page changes", async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 10,
        getPage: vi.fn(),
      }),
    });

    const data = new Uint8Array([1, 2, 3]).buffer;
    const { rerender } = render(<PdfViewer data={data} currentPage={1} />);

    expect(await screen.findByText("page 1")).toBeInTheDocument();

    rerender(<PdfViewer data={data} currentPage={2} />);

    expect(await screen.findByText("page 2")).toBeInTheDocument();
    expect(getDocumentMock).toHaveBeenCalledTimes(1);
  });
});

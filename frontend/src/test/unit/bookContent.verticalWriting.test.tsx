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

describe("BookContent vertical writing", () => {
  it("lays out Japanese text top-to-bottom and maps the mouse wheel to right-to-left columns", () => {
    const contentRef = createRef<HTMLDivElement>();

    const { container } = renderWithProviders(
      <BookContent
        bookMetadata={metadata}
        contentRef={contentRef}
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

    expect(wheelWasNotCancelled).toBe(false);
    expect(readingSurface!.scrollLeft).toBe(480);
  });
});

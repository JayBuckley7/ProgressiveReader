import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfPageCanvas } from "@features/reader/pdfOverlay/PdfPageCanvas";
import { renderWithProviders } from "../test-utils";

const showDefinitionPopupMock = vi.fn();

vi.mock("@features/reader/components/JpdbPopup", () => ({
  showDefinitionPopup: (...args: unknown[]) => showDefinitionPopupMock(...args),
}));

vi.mock("@features/reader/content/api-adapter", () => ({
  loadConfig: vi.fn(),
  parseText: vi.fn(async () => [
    {
      start: 0,
      end: 4,
      length: 4,
      card: {
        vid: 1,
        sid: 1,
        rid: 1,
        state: ["new"],
        spelling: "test",
        reading: "test",
        frequencyRank: null,
        pitchAccent: [],
        meanings: [],
      },
      rubies: [],
    },
  ]),
}));

describe("PdfPageCanvas", () => {
  beforeEach(() => {
    showDefinitionPopupMock.mockClear();

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
      callback(new Blob(["page"], { type: "image/png" }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest: vi.fn(async () => new Uint8Array([1, 2, 3, 4]).buffer),
        },
      },
    });
  });

  it("renders OCR token hitboxes and opens lookup popup on click", async () => {
    const processPageLayout = vi.fn(async () => ({
      status: "ready" as const,
      cacheHit: false,
      contentHash: "01020304",
      ocrProfile: "google-vision-document-v1",
      pageIndex: 0,
      image: { width: 200, height: 100 },
      lines: [
        {
          id: "line-1",
          text: "test",
          order: 0,
          direction: "horizontal" as const,
          confidence: 0.99,
          bboxNorm: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
          polygonNorm: [],
          atomIds: ["atom-1"],
        },
      ],
      atoms: [
        {
          id: "atom-1",
          text: "test",
          lineId: "line-1",
          order: 0,
          direction: "horizontal" as const,
          confidence: 0.99,
          bboxNorm: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
          polygonNorm: [],
        },
      ],
    }));

    const pdf = {
      getPage: vi.fn(async () => ({
        getViewport: vi.fn(() => ({ width: 200, height: 100 })),
        render: vi.fn(() => ({ promise: Promise.resolve() })),
      })),
    };

    renderWithProviders(
      <PdfPageCanvas pdf={pdf} pageNumber={1} documentId="book-1" documentVersion="v1" />,
      {
        depsOverride: {
          backend: {
            ocr: {
              processPdf: vi.fn(),
              processPageLayout,
            },
          } as any,
        },
      }
    );

    const lookupButton = await screen.findByRole("button", { name: "Lookup test" });
    expect(await screen.findByText("Tap words to look up")).toBeInTheDocument();
    expect(processPageLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        pageIndex: 0,
        documentId: "book-1",
        documentVersion: "v1",
        contentHash: "01020304",
      })
    );

    expect(lookupButton).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "30%",
      height: "10%",
    });

    fireEvent.click(lookupButton);

    await waitFor(() => {
      expect(showDefinitionPopupMock).toHaveBeenCalledWith(
        "test",
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ sentence: "test" }),
        expect.objectContaining({ pin: true, sourceElement: lookupButton })
      );
    });
  });
});

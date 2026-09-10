import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PdfPageCanvas } from "@features/reader/pdfOverlay/PdfPageCanvas";
import { parseWithLocalLookup } from "@features/reader/utils/localTextParser";
import { sidecarLayout } from "@features/reader/comic/cloudOcr";
import { renderWithProviders } from "../test-utils";

const showDefinitionPopupMock = vi.fn();

vi.mock("@features/reader/components/JpdbPopupBridge", () => ({
  showDefinitionPopup: (...args: unknown[]) => showDefinitionPopupMock(...args),
}));

vi.mock("@features/reader/utils/localTextParser", () => ({
  parseWithLocalLookup: vi.fn(async (text: string) => [{ start: 0, end: text.length, card: { spelling: text } }]),
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
  it('uses local recognition, exposes retryable errors, and makes zero backend OCR calls', async () => {
    const backendOcr = vi.fn();
    const recognizePage = vi.fn()
      .mockRejectedValueOnce(new Error('Could not download Japanese OCR model.'))
      .mockResolvedValue({ status: 'ready', image: { width: 200, height: 100 }, lines: [], atoms: [] });
    const pdf = { getPage: vi.fn(async () => ({ getViewport: () => ({ width: 200, height: 100 }), render: () => ({ promise: Promise.resolve() }) })) };
    renderWithProviders(<PdfPageCanvas pdf={pdf} pageNumber={1} recognizePage={recognizePage} />, {
      depsOverride: { backend: { ocr: { processPageLayout: backendOcr } } as any },
    });
    expect(await screen.findByText('Could not download Japanese OCR model.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry lookup' }));
    expect(await screen.findByText(/No text detected/)).toBeInTheDocument();
    expect(recognizePage).toHaveBeenCalledTimes(2);
    expect(backendOcr).not.toHaveBeenCalled();
  });

  it('only recognizes a selected crop and places words in page coordinates', async () => {
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as any;
    vi.stubGlobal('PointerEvent', MouseEvent);
    const recognizePage = vi.fn(async () => sidecarLayout({ version: 1, regions: [
      { text: '首都', x: 0, y: 0, width: 1, height: 1 },
    ] }, 'crop'));
    const pdf = { getPage: vi.fn(async () => ({ getViewport: () => ({ width: 200, height: 100 }), render: () => ({ promise: Promise.resolve() }) })) };
    const { container } = renderWithProviders(<PdfPageCanvas pdf={pdf} pageNumber={1} recognizePage={recognizePage} inspectArea />);
    await waitFor(() => expect(container.querySelector('canvas')?.width).toBe(200));
    expect(recognizePage).not.toHaveBeenCalled();
    const surface = container.querySelector('.overflow-hidden') as HTMLDivElement;
    container.querySelector('canvas')!.parentElement!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
    surface.setPointerCapture = vi.fn(); surface.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 20, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 150, clientY: 80 });
    const word = await screen.findByRole('button', { name: 'Lookup 首都' });
    expect(drawImage).toHaveBeenCalledWith(container.querySelector('canvas'), 50, 20, 100, 60.00000000000001, 0, 0, 100, 60);
    expect(word.style.left).toBe('25%');
    expect(word.style.top).toBe('20%');
    expect(recognizePage).toHaveBeenCalledOnce();
    // Clicking away to dismiss a word popup preserves the region and its words.
    fireEvent.pointerDown(surface, { clientX: 180, clientY: 90, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 180, clientY: 90 });
    expect(screen.getByLabelText('Selected OCR area')).toBeInTheDocument();
    expect(word).toBeInTheDocument();
    expect(recognizePage).toHaveBeenCalledOnce();
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 40 });
    fireEvent.pointerCancel(surface);
    expect(word).toBeInTheDocument();
    // A deliberate replacement still recognizes a new crop.
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 40, clientY: 50 });
    await waitFor(() => expect(recognizePage).toHaveBeenCalledTimes(2));
    vi.unstubAllGlobals();
  });

  it('parses saved Android columns separately and keeps each lookup on its own box', async () => {
    const layout = sidecarLayout({ version: 1, engine: 'mlkit-japanese-v2', regions: [
      { text: '首都', x: .7, y: .1, width: .1, height: .3, direction: 'vertical' },
      { text: '人民', x: .85, y: .1, width: .1, height: .3, direction: 'vertical' },
    ] }, 'hash');
    const pdf = { getPage: vi.fn(async () => ({ getViewport: () => ({ width: 200, height: 300 }), render: () => ({ promise: Promise.resolve() }) })) };
    renderWithProviders(<PdfPageCanvas pdf={pdf} pageNumber={1} recognizePage={async () => layout} />);
    const second = await screen.findByRole('button', { name: 'Lookup 人民' });
    expect(second.style.left).toBe('85%');
    expect(vi.mocked(parseWithLocalLookup).mock.calls.map(([text]) => text)).toEqual(['首都', '人民']);
    fireEvent.click(second);
    expect(showDefinitionPopupMock.mock.calls[0][0]).toBe('人民');
  });

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

  it("renders visible token annotations when PDF highlighting is enabled", async () => {
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
      <PdfPageCanvas
        pdf={pdf}
        pageNumber={1}
        documentId="book-1"
        documentVersion="v1"
        showTokenHighlights
      />,
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
    expect(lookupButton).toHaveClass("bg-yellow-300/25");
  });

  it("still prepares lookup when Web Crypto is unavailable", async () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });

    const processPageLayout = vi.fn(async () => ({
      status: "ready" as const,
      cacheHit: false,
      contentHash: "server-hash",
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

    renderWithProviders(<PdfPageCanvas pdf={pdf} pageNumber={1} />, {
      depsOverride: {
        backend: {
          ocr: {
            processPdf: vi.fn(),
            processPageLayout,
          },
        } as any,
      },
    });

    expect(await screen.findByRole("button", { name: "Lookup test" })).toBeInTheDocument();
    expect(processPageLayout).toHaveBeenCalledWith(
      expect.not.objectContaining({
        contentHash: expect.any(String),
      })
    );
  });
});

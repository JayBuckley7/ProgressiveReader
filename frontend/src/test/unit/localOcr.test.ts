import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { recognizeLocalPage, tesseractLayout } from '@features/reader/comic/localOcr';
import { createWorker } from 'tesseract.js';
import { alignTokensToOverlayByLine } from '@features/reader/pdfOverlay/tokenAlignment';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn(), OEM: { LSTM_ONLY: 1 }, PSM: { AUTO: '3', SINGLE_BLOCK_VERT_TEXT: '5' } }));
const rows = vi.hoisted(() => new Map());
vi.mock('idb', () => ({ openDB: async () => ({
  get: async (_: string, key: string) => rows.get(key), close() {},
  transaction: () => ({ store: { put: async (value: unknown, key: string) => rows.set(key, value), getAllKeys: async () => [...rows.keys()] }, done: Promise.resolve() }),
}) }));

const block = { paragraphs: [{ lines: [{ bbox: { x0: 10, y0: 20, x1: 60, y1: 40 }, confidence: 90, words: [
  { text: '日本', confidence: 95, bbox: { x0: 10, y0: 20, x1: 60, y1: 40 }, symbols: [
    { text: '日', confidence: 95, bbox: { x0: 10, y0: 20, x1: 35, y1: 40 } },
    { text: '本', confidence: 90, bbox: { x0: 35, y0: 20, x1: 60, y1: 40 } },
  ] },
] }] }] };
const worker = () => ({ setParameters: vi.fn().mockResolvedValue(undefined), recognize: vi.fn().mockResolvedValue({ data: { blocks: [block] } }), terminate: vi.fn().mockResolvedValue(undefined) });

beforeEach(() => {
  rows.clear(); vi.mocked(createWorker).mockReset();
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close() {} })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('local comic OCR', () => {
  it('keeps Japanese symbols aligned to their normalized boxes', () => {
    const layout = tesseractLayout({ blocks: [block] } as any, 100, 100, 'hash');
    expect(layout.lines[0].text).toBe('日本');
    expect(layout.atoms.map(atom => atom.text)).toEqual(['日', '本']);
    expect(layout.atoms[0].bboxNorm).toEqual({ x: 0.1, y: 0.2, width: 0.25, height: 0.2 });
    expect(layout.lines[0].atomIds).toEqual(layout.atoms.map(atom => atom.id));
  });
  it('recovers tappable vertical word boxes when Tesseract returns zero-width symbols', () => {
    const vertical = structuredClone(block);
    vertical.paragraphs[0].lines[0].bbox = { x0: 70, y0: 10, x1: 90, y1: 90 };
    for (const symbol of vertical.paragraphs[0].lines[0].words[0].symbols) symbol.bbox = { x0: 0, y0: 40, x1: 0, y1: 60 };
    const layout = tesseractLayout({ blocks: [vertical] } as any, 100, 100, 'vertical');
    const targets = alignTokensToOverlayByLine(layout, [{ start: 0, end: 1, length: 1, card: { spelling: '日' } }] as any);
    expect(layout.lines[0].direction).toBe('vertical');
    expect(targets[0].bboxNorm).toMatchObject({ x: 0.7, y: 0.1, height: 0.4 });
    expect(targets[0].bboxNorm.width).toBeCloseTo(0.2);
  });
  it('caches separately per account, guest, and text layout, and closes every worker', async () => {
    const engine = worker(); vi.mocked(createWorker).mockResolvedValue(engine as any);
    const read = (owner: string | null, direction: 'auto' | 'vertical' = 'auto') => recognizeLocalPage(new Blob(['image']), owner, direction, new AbortController().signal, vi.fn());
    expect((await read('alice')).cacheHit).toBe(false);
    expect((await read('alice')).cacheHit).toBe(true);
    await read('bob'); await read(null); await read('alice', 'vertical');
    expect(createWorker).toHaveBeenCalledTimes(4);
    expect(engine.terminate).toHaveBeenCalledTimes(4);
    expect(rows.size).toBe(4);
  });
  it('terminates a worker that finishes initialization after cancellation', async () => {
    const engine = worker(); let resolve!: (value: any) => void;
    vi.mocked(createWorker).mockImplementation(() => new Promise(r => { resolve = r; }));
    const controller = new AbortController();
    const result = recognizeLocalPage(new Blob(['image']), undefined, 'auto', controller.signal, vi.fn());
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalledTimes(1));
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected; resolve(engine);
    await vi.waitFor(() => expect(engine.terminate).toHaveBeenCalled());
    expect(engine.recognize).not.toHaveBeenCalled(); expect(rows.size).toBe(0);
  });
  it('bounds a stalled recognition and does not cache its uncertain result', async () => {
    vi.useFakeTimers();
    const engine = worker(); engine.recognize.mockImplementation(() => new Promise(() => {}));
    vi.mocked(createWorker).mockResolvedValue(engine as any);
    const result = recognizeLocalPage(new Blob(['image']), 'alice', 'auto', new AbortController().signal, vi.fn());
    await vi.waitFor(() => expect(engine.recognize).toHaveBeenCalled());
    const rejected = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(engine.terminate).toHaveBeenCalled();
    expect(rows.size).toBe(0);
  });
});

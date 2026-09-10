import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { loadDriveOcr, sidecarLayout } from '@features/reader/comic/cloudOcr';
import { alignTokensToOverlayByLine } from '@features/reader/pdfOverlay/tokenAlignment';
const rows = vi.hoisted(() => new Map());
vi.mock('idb', () => ({ openDB: async () => ({ get: async (_: string, k: string) => rows.get(k), put: async (_: string, v: unknown, k: string) => rows.set(k, v), close() {} }) }));
const page = { version: 1 as const, engine: 'mlkit-japanese-v2', regions: [{ text: '日本', x: .8, y: .1, width: .1, height: .08, direction: 'vertical' as const }] };
beforeEach(() => { rows.clear(); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => vi.unstubAllGlobals());
const original = () => new Blob(['original image']);
it('loads Android OCR and reuses it offline using GET requests only', async () => {
  const requestJson = vi.fn().mockResolvedValue({ page });
  const run = () => loadDriveOcr(original(), 'alice', { requestJson } as any, () => true, new AbortController().signal, vi.fn());
  expect((await run()).lines[0].text).toBe('日本');
  requestJson.mockRejectedValue(new Error('offline'));
  expect((await run()).lines[0].text).toBe('日本');
  expect(requestJson.mock.calls.every(([r]) => !r.method && !r.body)).toBe(true);
});
it.each([null, { ...page, engine: 'tesseract-vertical' }])('requires Android processing when Android OCR is absent', async remote => {
  const requestJson = vi.fn().mockResolvedValue({ page: remote });
  await expect(loadDriveOcr(original(), 'alice', { requestJson } as any, () => true, new AbortController().signal, vi.fn())).rejects.toThrow('Android app');
  expect(requestJson).toHaveBeenCalledTimes(1);
});
it('never displays another account cache after a switch', async () => {
  let current = true;
  const requestJson = vi.fn(async () => { current = false; return { page }; });
  await expect(loadDriveOcr(original(), 'alice', { requestJson } as any, () => current, new AbortController().signal, vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
  expect(rows.size).toBe(0);
});
it('preserves vertical line placement even when normalized height is smaller than width', () => {
  const layout = sidecarLayout(page, 'hash');
  const targets = alignTokensToOverlayByLine(layout, [{ start: 0, end: 1, card: { spelling: '日' } }] as any);
  expect(targets[0].bboxNorm.x).toBeCloseTo(.8);
  expect(targets[0].bboxNorm.y).toBeCloseTo(.1);
  expect(targets[0].bboxNorm.height).toBeCloseTo(.04);
});

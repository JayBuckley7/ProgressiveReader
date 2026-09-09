import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { sidecarLayout, withDriveOcr } from '@features/reader/comic/cloudOcr';
const rows = vi.hoisted(() => new Map());
vi.mock('idb', () => ({ openDB: async () => ({ get: async (_: string, k: string) => rows.get(k), put: async (_: string, v: unknown, k: string) => rows.set(k, v), close() {} }) }));
const page = { version: 1 as const, regions: [{ text: '女神', x: .1, y: .2, width: .1, height: .4 }] };
beforeEach(() => { rows.clear(); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => vi.unstubAllGlobals());
const original = () => new Blob(['original image']);
it('reuses Android OCR without running the web engine, including offline reopen', async () => {
  const requestJson = vi.fn().mockResolvedValue({ page }); const local = vi.fn(); const status = vi.fn();
  const run = () => withDriveOcr(original(), 'alice', { requestJson } as any, () => true, new AbortController().signal, local, status);
  expect((await run()).lines[0].text).toBe('女神');
  requestJson.mockRejectedValue(new Error('offline'));
  expect((await run()).lines[0].text).toBe('女神');
  expect(local).not.toHaveBeenCalled();
});
it('uploads local cached OCR on reconnect and reports failed writes honestly', async () => {
  const requestJson = vi.fn().mockResolvedValueOnce({ page: null }).mockRejectedValueOnce(new Error('offline'));
  const status = vi.fn(); const local = vi.fn().mockResolvedValue(sidecarLayout(page, 'hash'));
  await withDriveOcr(original(), 'alice', { requestJson } as any, () => true, new AbortController().signal, local, status);
  expect(requestJson.mock.calls[1][0]).toMatchObject({ method: 'PUT', body: { ...page, engine: 'tesseract-auto' } });
  expect(status).toHaveBeenLastCalledWith(expect.stringContaining('unconfirmed'));
});
it('does not upload after an account switch', async () => {
  let current = true;
  const requestJson = vi.fn().mockResolvedValue({ page: null });
  const local = vi.fn(async () => { current = false; return sidecarLayout(page, 'hash'); });
  await expect(withDriveOcr(original(), 'alice', { requestJson } as any, () => current, new AbortController().signal, local, vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
  expect(requestJson).toHaveBeenCalledTimes(1);
});
it('rejects invalid geometry in cloud data', () => {
  expect(() => sidecarLayout({ version: 1, regions: [{ ...page.regions[0], width: NaN }] }, 'x')).toThrow();
});

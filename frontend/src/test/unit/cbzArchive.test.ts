import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js';
import { openCbz } from '@features/reader/comic/cbzArchive';
beforeAll(() => vi.stubGlobal('Blob', NodeBlob));
afterAll(() => vi.unstubAllGlobals());

async function archive(files: Record<string, string>) {
  const writer = new ZipWriter(new Uint8ArrayWriter());
  for (const [name, content] of Object.entries(files)) await writer.add(name, new TextReader(content), { useWebWorkers: false });
  return (await writer.close()).buffer as ArrayBuffer;
}

describe('CBZ archives', () => {
  it('reads original images in natural order and excludes archive metadata', async () => {
    const comic = await openCbz(await archive({ '10.PNG': 'ten', '2.jpg': 'two', '__MACOSX/._1.png': 'metadata', 'ComicInfo.xml': '<ComicInfo/>' }));
    try {
      expect(comic.pageCount).toBe(2);
      expect(await (await comic.page(0)).text()).toBe('two');
      expect((await comic.page(0)).type).toBe('image/jpeg');
      expect(await (await comic.page(1)).text()).toBe('ten');
      await expect(comic.page(2)).rejects.toThrow('missing');
    } finally { await comic.close(); }
  });
  it('reports empty and corrupt archives instead of rendering an empty book', async () => {
    await expect(openCbz(await archive({ 'ComicInfo.xml': 'metadata' }))).rejects.toThrow('no supported');
    await expect(openCbz(new TextEncoder().encode('broken zip').buffer)).rejects.toThrow();
  });
});

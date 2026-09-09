import { BlobWriter, Uint8ArrayReader, ZipReader, type Entry } from '@zip.js/zip.js';

const MAX_PAGE_BYTES = 20_000_000;
const imageTypes: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const imageType = (name: string) => imageTypes[name.split('.').pop()?.toLowerCase() || ''];

export async function openCbz(data: ArrayBuffer) {
  if (data.byteLength > 500_000_000) throw new Error('This CBZ exceeds the 500 MB reader limit.');
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(data)), { useWebWorkers: false });
  try {
    const entries: Entry[] = [];
    for await (const entry of reader.getEntriesGenerator()) {
      if (entries.length >= 5000) throw new Error('This CBZ contains too many files.');
      entries.push(entry);
    }
    const pages = entries.filter(entry => !entry.directory && !entry.filename.startsWith('__MACOSX/') && imageType(entry.filename));
    pages.sort((a, b) => a.filename.localeCompare(b.filename, 'en', { numeric: true }));
    if (!pages.length) throw new Error('This CBZ contains no supported page images.');
    if (new Set(pages.map(page => page.filename)).size !== pages.length) throw new Error('This CBZ contains duplicate page names.');
    if (pages.some(page => page.uncompressedSize <= 0 || page.uncompressedSize > MAX_PAGE_BYTES)) throw new Error('A comic page exceeds the 20 MB limit.');
    return {
      pageCount: pages.length,
      async page(index: number): Promise<Blob> {
        const entry = pages[index];
        if (!entry || !entry.getData) throw new Error('Comic page is missing.');
        const blob = await entry.getData(new BlobWriter(imageType(entry.filename)), { checkSignature: true, onprogress: async count => { if (count > MAX_PAGE_BYTES) throw new Error('Comic page exceeds the size limit.'); } });
        if (blob.size > MAX_PAGE_BYTES) throw new Error('Comic page exceeds the size limit.');
        return blob;
      },
      close: () => reader.close(),
    };
  } catch (error) { await reader.close(); throw error; }
}

import { createWorker, OEM, PSM, type Page, type Bbox, type Worker } from 'tesseract.js';
import type { OcrPageLayoutResponse } from '@core/backend/ports';
import { openDB } from 'idb';

export type OcrDirection = 'auto' | 'vertical';
const MODEL_VERSION = 'tesseract-6-jpn-v2';
const abortError = () => new DOMException('OCR cancelled', 'AbortError');

export function tesseractLayout(data: Pick<Page, 'blocks'>, width: number, height: number, hash: string): OcrPageLayoutResponse {
  const lines: OcrPageLayoutResponse['lines'] = [];
  const atoms: OcrPageLayoutResponse['atoms'] = [];
  const box = (b: Bbox) => {
    const x = Math.max(0, Math.min(1, b.x0 / width)); const y = Math.max(0, Math.min(1, b.y0 / height));
    return { x, y, width: Math.max(0, Math.min(1 - x, (b.x1 - b.x0) / width)), height: Math.max(0, Math.min(1 - y, (b.y1 - b.y0) / height)) };
  };
  for (const block of data.blocks || []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
    const id = `line-${lines.length}`;
    const direction = line.bbox.y1 - line.bbox.y0 > (line.bbox.x1 - line.bbox.x0) * 1.4 ? 'vertical' : 'horizontal';
    let lineAtoms = line.words.flatMap<{ text: string; confidence: number; bbox: Bbox }>(word => word.symbols?.length ? word.symbols : [word]).filter(symbol => symbol.text.trim());
    if (!lineAtoms.length) continue;
    // Tesseract's vertical model can return valid line boxes but rotated/zero-width
    // symbol boxes. Keep the recognized line and let alignment proportionally slice
    // its box instead of publishing invisible or overlapping word targets.
    if (lineAtoms.some(atom => atom.bbox.x1 <= atom.bbox.x0 || atom.bbox.y1 <= atom.bbox.y0)) {
      lineAtoms = [{ text: lineAtoms.map(atom => atom.text).join(''), confidence: line.confidence, bbox: line.bbox }];
    }
    const atomIds = lineAtoms.map(symbol => {
      const atomId = `atom-${atoms.length}`;
      atoms.push({ id: atomId, text: symbol.text, lineId: id, order: atoms.length, direction, confidence: symbol.confidence / 100, bboxNorm: box(symbol.bbox), polygonNorm: [] });
      return atomId;
    });
    lines.push({ id, text: lineAtoms.map(symbol => symbol.text).join(''), order: lines.length, direction, confidence: line.confidence / 100, bboxNorm: box(line.bbox), polygonNorm: [], atomIds });
  }
  return { status: 'ready', cacheHit: false, contentHash: hash, ocrProfile: MODEL_VERSION, pageIndex: 0, image: { width, height }, lines, atoms };
}

async function cache() {
  return openDB('pr-local-page-ocr-v1', 1, { upgrade(db) { db.createObjectStore('pages'); } });
}

/** Only model files are fetched. Page pixels remain in the browser worker. */
export async function recognizeLocalPage(image: Blob, owner: string | null | undefined, direction: OcrDirection, signal: AbortSignal, progress: (message: string) => void): Promise<OcrPageLayoutResponse> {
  const digest = await crypto.subtle.digest('SHA-256', await image.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const prefix = JSON.stringify([owner ?? 'device-guest', MODEL_VERSION]);
  const key = `${prefix}:${direction}:${hash}`;
  if (signal.aborted) throw abortError();
  if (owner !== undefined) {
    try {
      const db = await cache(); const hit = await db.get('pages', key); db.close();
      if (!signal.aborted && hit?.layout?.status === 'ready' && Array.isArray(hit.layout.lines) && Array.isArray(hit.layout.atoms)) return { ...hit.layout, cacheHit: true };
    } catch { /* Cache failure never prevents reading/OCR. */ }
  }
  if (signal.aborted) throw abortError();
  let stopped = false;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => { stopped = true; void worker?.terminate(); reject(abortError()); };
    signal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => { stopped = true; void worker?.terminate(); reject(new Error('OCR timed out. Please retry this page.')); }, 120_000);
  });
  const run = async () => {
    const created = await createWorker(direction === 'vertical' ? 'jpn_vert' : 'jpn', OEM.LSTM_ONLY, {
      workerPath: '/ocr-runtime/worker.min.js', corePath: '/ocr-runtime/', workerBlobURL: false,
      logger: event => progress(event.status.includes('recogniz') ? `Reading text… ${Math.round(event.progress * 100)}%` : 'Preparing Japanese OCR (first use downloads the language model)…'),
    });
    worker = created;
    if (stopped || signal.aborted) { await created.terminate(); throw abortError(); }
    await created.setParameters({ tessedit_pageseg_mode: direction === 'vertical' ? PSM.SINGLE_BLOCK_VERT_TEXT : PSM.AUTO, preserve_interword_spaces: '1' });
    const bitmap = await createImageBitmap(image);
    const width = bitmap.width; const height = bitmap.height; bitmap.close();
    const { data } = await created.recognize(image, {}, { blocks: true, text: true });
    if (stopped || signal.aborted) throw abortError();
    const layout = tesseractLayout(data, width, height, hash);
    if (owner !== undefined) {
      try {
        const db = await cache();
        const tx = db.transaction('pages', 'readwrite');
        await tx.store.put({ layout, accessedAt: Date.now() }, key);
        const keys = await tx.store.getAllKeys();
        const own = keys.filter(k => String(k).startsWith(prefix + ':'));
        if (own.length > 100) {
          const rows = await Promise.all(own.map(async k => ({ key: k, time: (await tx.store.get(k)).accessedAt })));
          rows.sort((a, b) => a.time - b.time);
          for (const row of rows.slice(0, own.length - 100)) await tx.store.delete(row.key);
        }
        await tx.done; db.close();
      } catch { /* OCR remains usable when storage is unavailable/full. */ }
    }
    return layout;
  };
  try { return await Promise.race([run(), aborted]); }
  finally { stopped = true; if (timer) clearTimeout(timer); signal.removeEventListener('abort', cancel); void worker?.terminate(); }
}

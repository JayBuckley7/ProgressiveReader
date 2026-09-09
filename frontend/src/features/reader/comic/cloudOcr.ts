import { openDB } from 'idb';
import type { BackendFetchPort } from '@core/backend/fetchPort';
import type { OcrPageLayoutResponse } from '@core/backend/ports';

export interface OcrSidecar {
  version: 1;
  engine?: string;
  regions: { text: string; x: number; y: number; width: number; height: number }[];
}

export function sidecarLayout(page: OcrSidecar, hash: string): OcrPageLayoutResponse {
  if (page.version !== 1 || !Array.isArray(page.regions) || page.regions.length > 5000 || page.regions.some(r =>
    typeof r.text !== 'string' || !r.text || ![r.x, r.y, r.width, r.height].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || r.width <= 0 || r.height <= 0)) throw new Error('Invalid saved OCR');
  const atoms = page.regions.map((r, i) => ({ id: `atom-${i}`, lineId: `line-${i}`, text: r.text, order: i,
    direction: r.height > r.width ? 'vertical' as const : 'horizontal' as const,
    confidence: 1, bboxNorm: { x: r.x, y: r.y, width: r.width, height: r.height }, polygonNorm: [] }));
  return { status: 'ready', cacheHit: true, contentHash: hash, ocrProfile: 'drive-sidecar-v1', pageIndex: 0,
    image: { width: 1, height: 1 }, atoms,
    lines: atoms.map(a => ({ ...a, id: a.lineId, atomIds: [a.id] })) };
}

/** Hash the original archive entry, never a platform-specific resized canvas. */
export async function withDriveOcr(original: Blob, owner: string, backend: BackendFetchPort,
  isCurrentAccount: () => boolean, signal: AbortSignal,
  local: () => Promise<OcrPageLayoutResponse>, status: (message: string) => void, direction: 'auto' | 'vertical' = 'auto'): Promise<OcrPageLayoutResponse> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await original.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
  const cacheKey = JSON.stringify([owner, hash]);
  async function cached(page?: OcrSidecar): Promise<OcrSidecar | undefined> {
    const db = await openDB('pr-drive-ocr-v1', 1, { upgrade(db) { db.createObjectStore('pages'); } });
    try {
      if (page) { await db.put('pages', page, cacheKey); return page; }
      return await db.get('pages', cacheKey);
    } finally { db.close(); }
  }
  const headers = { 'X-OCR-Account': owner };
  const path = `/drive/ocr/pages/${hash}`;
  const requestSignal = () => AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  let readable = false;
  try {
    if (!isCurrentAccount()) throw new Error('Account changed');
    status('Checking Drive for saved OCR…');
    const { page } = await backend.requestJson<{ page: OcrSidecar | null }>({ path, headers, signal: requestSignal() });
    if (signal.aborted || !isCurrentAccount()) throw new DOMException('Cancelled', 'AbortError');
    if (page) { const layout = sidecarLayout(page, hash); await cached(page).catch(() => {}); status('OCR loaded from Drive'); return layout; }
    readable = true;
  } catch {
    if (signal.aborted || !isCurrentAccount()) throw new DOMException('Cancelled', 'AbortError');
  }
  const saved = await cached().catch(() => undefined);
  let result: OcrPageLayoutResponse | undefined;
  if (saved) { try { result = sidecarLayout(saved, hash); } catch { /* Recompute corrupt local cache. */ } }
  result ??= await local();
  if (!readable) { status('OCR saved locally. Drive unavailable; reopen this page to retry sync.'); return result; }
  try {
    if (signal.aborted || !isCurrentAccount()) throw new DOMException('Cancelled', 'AbortError');
    const body: OcrSidecar = { version: 1, engine: direction === 'vertical' ? 'tesseract-vertical' : 'tesseract-auto', regions: result.lines.map(line => ({ text: line.text, ...line.bboxNorm })) };
    status('Saving OCR to Drive…');
    await backend.requestJson({ path, headers, method: 'PUT', body, signal: requestSignal() });
    if (isCurrentAccount() && !signal.aborted) status('OCR saved to Drive');
  } catch {
    if (signal.aborted || !isCurrentAccount()) throw new DOMException('Cancelled', 'AbortError');
    status('OCR saved locally. Drive save unconfirmed; reopen this page to retry sync.');
  }
  return result;
}

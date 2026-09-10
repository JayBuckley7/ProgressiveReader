import { openDB } from 'idb';
import type { BackendFetchPort } from '@core/backend/fetchPort';
import type { OcrPageLayoutResponse } from '@core/backend/ports';

export interface OcrSidecar {
  version: 1;
  engine?: string;
  revision?: string;
  regions: { text: string; x: number; y: number; width: number; height: number; direction?: 'horizontal' | 'vertical' }[];
}

export function sidecarLayout(page: OcrSidecar, hash: string): OcrPageLayoutResponse {
  if (page.version !== 1 || !Array.isArray(page.regions) || page.regions.length > 5000 || page.regions.some(r =>
    typeof r.text !== 'string' || !r.text.trim() || r.text.length > 10000 || (r.direction != null && !['vertical', 'horizontal'].includes(r.direction)) || ![r.x, r.y, r.width, r.height].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || r.width <= 0 || r.height <= 0 || r.x + r.width > 1.00001 || r.y + r.height > 1.00001)) throw new Error('Invalid saved OCR');
  const atoms = page.regions.map((r, i) => ({ id: `atom-${i}`, lineId: `line-${i}`, text: r.text, order: i,
    direction: r.direction ?? (r.height > r.width ? 'vertical' as const : 'horizontal' as const),
    confidence: 1, bboxNorm: { x: r.x, y: r.y, width: r.width, height: r.height }, polygonNorm: [] }));
  return { status: 'ready', cacheHit: true, contentHash: hash, ocrProfile: 'drive-sidecar-v1', pageIndex: 0,
    image: { width: 1, height: 1 }, atoms,
    lines: atoms.map(a => ({ ...a, id: a.lineId, atomIds: [a.id] })) };
}

/** Display Android-generated OCR only. This path never recognizes or uploads pages. */
export async function loadDriveOcr(original: Blob, owner: string, backend: BackendFetchPort,
  isCurrentAccount: () => boolean, signal: AbortSignal, status: (message: string) => void): Promise<OcrPageLayoutResponse> {
  const check = () => { if (signal.aborted || !isCurrentAccount()) throw new DOMException('Cancelled', 'AbortError'); };
  check();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await original.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
  const key = JSON.stringify([owner, hash]);
  const android = (page: OcrSidecar | null | undefined) => page?.engine?.startsWith('mlkit-japanese-') === true;
  async function cache(page?: OcrSidecar): Promise<OcrSidecar | undefined> {
    const db = await openDB('pr-drive-ocr-v1', 1, { upgrade(db) { db.createObjectStore('pages'); } });
    try {
      if (page) { await db.put('pages', { page, pending: false }, key); return page; }
      const row = await db.get('pages', key);
      return row?.version === 1 ? row : row?.page;
    } finally { db.close(); }
  }
  let reachable = false;
  try {
    status('Checking Drive for Android OCR…');
    const { page } = await backend.requestJson<{ page: OcrSidecar | null }>({
      path: `/drive/ocr/pages/${hash}`, headers: { 'X-OCR-Account': owner },
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    check();
    if (page) sidecarLayout(page, hash);
    reachable = true;
    if (android(page)) {
      await cache(page!).catch(() => {}); check();
      status('Android OCR loaded from Drive'); return sidecarLayout(page!, hash);
    }
  } catch { check(); }
  if (!reachable) {
    const saved = await cache().catch(() => undefined); check();
    if (android(saved)) {
      const layout = sidecarLayout(saved!, hash);
      status('Showing saved Android OCR. Drive is unavailable.'); return layout;
    }
    throw new Error('Drive is unavailable and no Android OCR is saved on this device. Reconnect and retry.');
  }
  throw new Error('Open this page in the Android app, run or repair OCR, and sync to Drive. Then reload text here.');
}

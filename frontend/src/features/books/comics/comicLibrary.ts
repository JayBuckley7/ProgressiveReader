export type Series = { title: string; edition?: string; coverBookId?: string | null; folderId?: string | null; source?: { package: string; sourceId: string; mangaUrl: string } | null };
export type Chapter = { seriesId: string | null; title: string; volume?: string; number?: string; manualOrder?: number | null; pageCount?: number | null };
export type ComicProgress = { page: number; pageCount: number; status: 'unread' | 'reading' | 'read'; updatedAt: number };
export type ComicValue = Series | Chapter | ComicProgress;
export type ComicRecord = { revision: string | null; value: ComicValue | null; conflicts: { revision: string; value: ComicValue | null }[] };
export type ComicState = { schemaVersion: 1; records: Record<string, ComicRecord> };
export type ComicChange = { operationId: string; recordId: string; baseRevision: string | null; value: ComicValue | null; resolves: string[] };
type Saved = { remote: ComicState; pending: ComicChange[] };
const empty = (): ComicState => ({ schemaVersion: 1, records: {} });

export class ComicLibrary {
  private saved: Saved;
  private listeners = new Set<() => void>();
  private running?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private readOnly = false;
  private snapshot: { state: ComicState; message: string; pending: number };
  constructor(readonly owner: string, private request: (path: string, init?: RequestInit) => Promise<Response>, private currentOwner: () => string, private storage: Storage = localStorage) {
    const text = storage.getItem(this.key);
    // A corrupt cache must be reported, never silently overwritten.
    this.saved = { remote: empty(), pending: [] };
    try {
      const parsed = text ? JSON.parse(text) : this.saved;
      if (parsed.remote?.schemaVersion !== 1 || !parsed.remote.records || !Array.isArray(parsed.pending)) throw new Error();
      this.saved = parsed;
    } catch { this.readOnly = true; }
    this.snapshot = { state: this.present(), message: this.readOnly ? 'Comic organization could not be read. The stored copy has been preserved; reading is still available.' : '', pending: this.saved.pending.length };
  }
  private get key() { return `comic-library-v1:${this.owner}`; }
  private present(): ComicState {
    const records = { ...this.saved.remote.records };
    for (const op of this.saved.pending) records[op.recordId] = { revision: op.operationId, value: op.value, conflicts: records[op.recordId]?.conflicts || [] };
    return { schemaVersion: 1, records };
  }
  private publish(message = this.snapshot.message) {
    this.storage.setItem(this.key, JSON.stringify(this.saved));
    this.snapshot = { state: this.present(), message, pending: this.saved.pending.length };
    this.listeners.forEach(fn => fn());
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  value<T extends ComicValue>(id: string): T | undefined { return this.snapshot.state.records[id]?.value as T | undefined; }
  edit(recordId: string, value: ComicValue | null, resolves: string[] = []) {
    if (this.readOnly || this.currentOwner() !== this.owner) return;
    const baseRevision = this.snapshot.state.records[recordId]?.revision || null;
    const before = this.saved.pending.slice();
    this.saved.pending.push({ operationId: crypto.randomUUID(), recordId, baseRevision, value, resolves });
    try { this.publish(this.owner === 'device' ? 'Saved on this device' : 'Saved locally; waiting to sync'); }
    catch {
      this.saved.pending = before;
      this.snapshot = { ...this.snapshot, message: 'Could not save comic changes on this device. Free some storage and try again.' };
      this.listeners.forEach(fn => fn()); return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.sync(); }, 900);
  }
  link(localId: string, driveId: string) {
    if (this.readOnly || this.currentOwner() !== this.owner) return;
    this.saved.pending = this.saved.pending.map(op => op.recordId === `chapter:${localId}` || op.recordId === `progress:${localId}` ? { ...op, recordId: `${op.recordId.split(':')[0]}:${driveId}` } : op);
    this.publish();
    void this.sync();
  }
  resolve(recordId: string, keepDevice: boolean) {
    const record = this.saved.remote.records[recordId];
    if (!record?.conflicts.length) return;
    this.saved.pending = this.saved.pending.filter(item => item.recordId !== recordId);
    this.snapshot = { ...this.snapshot, state: this.present() };
    this.edit(recordId, keepDevice ? record.conflicts[record.conflicts.length - 1].value : record.value, record.conflicts.map(item => item.revision));
  }
  sync(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (this.owner === 'device' || this.readOnly) return Promise.resolve();
    this.running = (async () => {
      try {
        const send = async (path: string, init?: RequestInit) => {
          if (this.currentOwner() !== this.owner) throw new Error('Account changed. Changes remain with their original account.');
          const headers = new Headers(init?.headers); headers.set('X-Comic-Account', this.owner);
          const response = await this.request(path, { ...init, headers, signal: AbortSignal.timeout(30000) });
          if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Drive sync unavailable. Changes remain on this device.'); }
          const data = await response.json();
          if (data.schemaVersion !== 1 || !data.records) throw new Error('Comic library response is unreadable. Local changes were retained.');
          return data as ComicState;
        };
        this.saved.remote = await send('/api/comic-library');
        while (this.saved.pending.length) {
          const op = this.saved.pending.find(item => item.recordId.startsWith('series:') || !item.recordId.split(':')[1].startsWith('local_'));
          // Device-only IDs are linked to Drive after the corresponding upload succeeds.
          if (!op) break;
          this.saved.remote = await send('/api/comic-library/operations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': op.operationId }, body: JSON.stringify(op) });
          this.saved.pending = this.saved.pending.filter(item => item.operationId !== op.operationId);
          this.publish();
        }
        this.publish(this.saved.pending.length ? 'Some chapters are still local' : 'Synced with Drive');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed. Local changes retained.';
        try { this.publish(message); } catch { this.snapshot = { ...this.snapshot, message: 'Changes could not be saved on this device. Free some storage and retry.' }; this.listeners.forEach(fn => fn()); }
      }
    })().finally(() => { this.running = undefined; });
    return this.running;
  }
}

export function compareChapters(a: Chapter, b: Chapter): number {
  if (a.manualOrder != null || b.manualOrder != null) return (a.manualOrder ?? Number.MAX_SAFE_INTEGER) - (b.manualOrder ?? Number.MAX_SAFE_INTEGER);
  const natural = (x: string, y: string) => x.localeCompare(y, 'en', { numeric: true });
  const volume = natural(a.volume || '', b.volume || '');
  if (volume) return volume;
  if (a.number && b.number && Number.isFinite(Number(a.number)) && Number.isFinite(Number(b.number))) return Number(a.number) - Number(b.number) || natural(a.title, b.title);
  return natural(a.number || a.title, b.number || b.title);
}

export function nextComic(ids: string[], state: ComicState): string | undefined {
  const progress = (id: string) => state.records[`progress:${id}`]?.value as ComicProgress | undefined;
  return ids.filter(id => progress(id)?.status === 'reading').sort((a, b) => (progress(b)?.updatedAt || 0) - (progress(a)?.updatedAt || 0))[0]
    || ids.find(id => progress(id)?.status !== 'read');
}

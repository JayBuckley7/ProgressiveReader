// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { ComicLibrary, compareChapters, nextComic, type ComicState, type ComicChange } from '@features/books/comics/comicLibrary';
import { adoptComicInfo, parseComicInfo } from '@features/books/comics/comicInfo';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubGlobal('crypto', webcrypto); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function server() {
  const state: ComicState = { schemaVersion: 1, records: {} };
  const seen = new Set<string>();
  let loseAck = false;
  const request = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.body) {
      const op: ComicChange = JSON.parse(String(init.body));
      if (!seen.has(op.operationId)) {
        const record = state.records[op.recordId] || { revision: null, value: null, conflicts: [] };
        if (record.revision !== op.baseRevision) record.conflicts.push({ revision: op.operationId, value: op.value });
        else { record.revision = op.operationId; record.value = op.value; record.conflicts = record.conflicts.filter(c => !op.resolves.includes(c.revision)); }
        state.records[op.recordId] = record; seen.add(op.operationId);
      }
      if (loseAck) { loseAck = false; throw new Error('Connection interrupted'); }
    }
    return new Response(JSON.stringify(state));
  });
  return { state, seen, request, loseNextAck: () => { loseAck = true; } };
}

it('persists before syncing and retries the same operation after a lost acknowledgement', async () => {
  const backend = server(); const store = new ComicLibrary('alice', backend.request, () => 'alice');
  store.edit('series:s', { title: 'Series' });
  expect(backend.request).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem('comic-library-v1:alice')!).pending).toHaveLength(1);
  backend.loseNextAck(); await store.sync();
  expect(store.getSnapshot().pending).toBe(1);
  const reopened = new ComicLibrary('alice', backend.request, () => 'alice'); await reopened.sync();
  expect(reopened.getSnapshot().pending).toBe(0); expect(backend.seen.size).toBe(1);
});

it('keeps device books pending without blocking unrelated Drive progress', async () => {
  const backend = server(); const store = new ComicLibrary('alice', backend.request, () => 'alice');
  store.edit('chapter:local_file', { seriesId: null, title: 'Local' });
  store.edit('progress:drive', { page: 4, pageCount: 10, status: 'reading', updatedAt: 1 });
  await store.sync();
  expect(store.getSnapshot().pending).toBe(1); expect(backend.state.records['progress:drive'].value).toMatchObject({ page: 4 });
  store.link('local_file', 'uploaded'); await store.sync();
  expect(backend.state.records['chapter:uploaded'].value).toMatchObject({ title: 'Local' });
});

it('retains concurrent progress changes and resolves explicitly', async () => {
  const backend = server(); const a = new ComicLibrary('alice', backend.request, () => 'alice');
  const b = new ComicLibrary('alice', backend.request, () => 'alice', sessionStorage);
  const progress = (page: number) => ({ page, pageCount: 20, status: 'reading' as const, updatedAt: page });
  a.edit('progress:book', progress(2)); b.edit('progress:book', progress(8));
  await a.sync(); await b.sync();
  expect(b.getSnapshot().state.records['progress:book'].conflicts).toHaveLength(1);
  b.resolve('progress:book', true); await b.sync();
  expect(backend.state.records['progress:book'].conflicts).toEqual([]);
  expect(backend.state.records['progress:book'].value).toMatchObject({ page: 8 });
});

it('never sends an originating account outbox with a different identity, or guest changes', async () => {
  const backend = server(); let owner = 'alice';
  const store = new ComicLibrary(owner, backend.request, () => owner);
  store.edit('series:s', { title: 'Private' }); owner = 'bob'; await store.sync();
  expect(backend.request).not.toHaveBeenCalled(); expect(store.getSnapshot().pending).toBe(1);
  const guest = new ComicLibrary('device', backend.request, () => 'device'); guest.edit('series:guest', { title: 'Guest' }); await guest.sync();
  expect(backend.request).not.toHaveBeenCalled();
});

it('preserves unreadable storage and does not overwrite it with an empty collection', async () => {
  localStorage.setItem('comic-library-v1:alice', 'broken'); const backend = server();
  const store = new ComicLibrary('alice', backend.request, () => 'alice');
  store.edit('series:s', { title: 'No write' }); await store.sync();
  expect(localStorage.getItem('comic-library-v1:alice')).toBe('broken'); expect(backend.request).not.toHaveBeenCalled();
  expect(store.getSnapshot().message).toContain('preserved');
});

it('orders decimal chapters and volumes and continues the most recently read chapter', () => {
  const chapters = ['10', '2.5', '2'].map(number => ({ seriesId: 's', title: number, volume: '1', number }));
  expect(chapters.sort(compareChapters).map(c => c.number)).toEqual(['2', '2.5', '10']);
  expect(compareChapters({ ...chapters[0], volume: '2' }, { ...chapters[0], volume: '10' })).toBeLessThan(0);
  const state: ComicState = { schemaVersion: 1, records: { 'progress:b': { revision: 'p', conflicts: [], value: { page: 3, pageCount: 5, status: 'reading', updatedAt: 2 } } } };
  expect(nextComic(['a', 'b'], state)).toBe('b');
});

it('uses embedded metadata without filename guessing, preserves manual assignment, and rejects entities', async () => {
  const info = parseComicInfo('<ComicInfo><Series>Example</Series><Title>Opening</Title><Volume>2</Volume><Number>3.5</Number><Year>2020</Year></ComicInfo>', 4);
  expect(info).toMatchObject({ series: 'Example', volume: '2', number: '3.5', edition: '2020', pageCount: 4 });
  expect(parseComicInfo('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///secret">]><ComicInfo/>', 1)).toBeNull();
  const backend = server(); const store = new ComicLibrary('device', backend.request, () => 'device');
  await adoptComicInfo(store, 'local_a', info, 'arbitrary filename');
  await adoptComicInfo(store, 'local_b', info, 'different filename');
  expect(Object.keys(store.getSnapshot().state.records).filter(id => id.startsWith('series:'))).toHaveLength(1);
  store.edit('chapter:local_a', { seriesId: null, title: 'Manual' });
  await adoptComicInfo(store, 'local_a', info, 'ignored');
  expect(store.value('chapter:local_a')).toMatchObject({ seriesId: null, title: 'Manual' });
});

/** Development-only generated data. This fixture makes no real Drive requests. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppDepsProvider } from '@app/deps/AppDepsProvider';
import type { AppDeps } from '@app/deps/AppDeps';
import { AppDataOverrideProvider, type AppDataContextType } from '@shared/contexts/AppDataContext';
import { ComicLibrary, type ComicState, type ComicChange } from '@features/books/comics/comicLibrary';
import { ComicSeriesLibrary, collapseComicSeries } from '@features/books/comics/ComicSeriesLibrary';
import { useComicLibrary } from '@features/books/comics/useComicLibrary';
import { FolderView } from '@features/books/components/FolderView';
import type { BookMetadata } from '~/types';
import '../../index.css';

if (!import.meta.env.DEV) throw new Error('This fixture only runs in development.');
const owner = 'comic-series-verification-v1';
let offline = false;
const remote: ComicState = JSON.parse(sessionStorage.getItem(`${owner}:remote`) || '{"schemaVersion":1,"records":{}}');
const acknowledged = new Set<string>(JSON.parse(sessionStorage.getItem(`${owner}:operations`) || '[]'));
const persist = () => { sessionStorage.setItem(`${owner}:remote`, JSON.stringify(remote)); sessionStorage.setItem(`${owner}:operations`, JSON.stringify([...acknowledged])); };
const request = async (_path: string, init?: RequestInit) => {
  if (offline) throw new Error('Offline. Changes remain on this device.');
  if (init?.body) {
    const op: ComicChange = JSON.parse(String(init.body));
    if (!acknowledged.has(op.operationId)) {
      const row = remote.records[op.recordId] || { revision: null, value: null, conflicts: [] };
      if (op.baseRevision === row.revision) { row.revision = op.operationId; row.value = op.value; row.conflicts = row.conflicts.filter(c => !op.resolves.includes(c.revision)); }
      else row.conflicts.push({ revision: op.operationId, value: op.value });
      remote.records[op.recordId] = row; acknowledged.add(op.operationId); persist();
    }
  }
  return new Response(JSON.stringify(remote));
};
const deps = { auth: { getUserId: () => owner }, backendFetch: { request: ({ path, ...init }: { path: string } & RequestInit) => request(path, init) },
  driveCache: { findCachedFileByPrefix: async (id: string) => id.endsWith('10') ? null : new Blob(['fixture']) } } as unknown as AppDeps;
const seed = new ComicLibrary(owner, request, () => owner);
if (!seed.value('series:fixture')) {
  seed.edit('series:fixture', { title: 'Paper Moon', coverBookId: 'fixture-2' });
  ['2', '2.5', '10'].forEach(number => seed.edit(`chapter:fixture-${number.replace('.', '_')}`, { seriesId: 'fixture', title: `Chapter ${number}`, number, pageCount: 3 }));
  seed.edit('progress:fixture-2_5', { page: 2, pageCount: 3, status: 'reading', updatedAt: Date.now() });
  await seed.sync();
}
const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#eee6d5"/><circle cx="180" cy="170" r="90" fill="#294751"/><text x="28" y="350" font-family="serif" font-size="35" fill="#294751">Paper Moon</text></svg>')}`;
const initialBooks: BookMetadata[] = ['2', '2.5', '10'].map(number => ({ id: `fixture-${number.replace('.', '_')}`, driveFileId: `fixture-${number.replace('.', '_')}`, title: `Chapter ${number}`, fileType: 'cbz', cloudProvider: 'google', userId: owner, uploadedAt: new Date(), coverUrl: cover }));
function Fixture() {
  const [books, setBooks] = useState(initialBooks);
  const [disconnected, setDisconnected] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState('');
  const { state, store } = useComicLibrary();
  return <AppDataOverrideProvider value={{ books } as AppDataContextType}><main className="mx-auto max-w-5xl p-6">
    <aside className="mb-6 rounded border p-3"><strong>Generated fixture · No real Drive requests</strong> <label><input type="checkbox" checked={disconnected} onChange={e => { offline = e.target.checked; setDisconnected(offline); if (!offline) void store.sync(); }} /> Simulate offline</label> <button className="rounded border p-2" onClick={() => { const row = remote.records['series:fixture']; row.revision = crypto.randomUUID(); row.value = { ...row.value as object, title: 'Cloud title' }; persist(); }}>Simulate another device renaming the series</button></aside>
    <h1 className="text-3xl font-semibold">Library</h1>{opened && <p role="status">Opened {opened}</p>}
    <ComicSeriesLibrary books={books} folders={[{ id: 'favorites', name: 'Favorites' } as never]} selected={selected} onSelect={setSelected} onOpen={setOpened} onDelete={id => setBooks(items => items.filter(b => b.id !== id))} />
    {!selected && <FolderView books={collapseComicSeries(books, state)} folders={[]} onSelectBook={id => setSelected(id.substring(13))} onDeleteBook={async () => {}} onUpdateCover={async () => undefined} onMoveBookToFolder={() => {}} />}
  </main></AppDataOverrideProvider>;
}
document.documentElement.dataset.theme = 'dark';
createRoot(document.getElementById('root')!).render(<AppDepsProvider deps={deps}><Fixture /></AppDepsProvider>);

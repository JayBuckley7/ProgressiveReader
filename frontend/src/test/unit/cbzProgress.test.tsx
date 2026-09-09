import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ComicLibrary } from '@features/books/comics/comicLibrary';
import { CbzViewer } from '@features/reader/comic/CbzViewer';

const fixture = vi.hoisted(() => ({ store: null as unknown as ComicLibrary, navigate: vi.fn(), bytes: new ArrayBuffer(1) }));
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => fixture.navigate }));
vi.mock('@app/deps/AppDepsProvider', () => ({ useAppDeps: () => ({ auth: { getUserId: () => null }, backendFetch: {} }) }));
vi.mock('@shared/contexts/AppDataContext', () => ({ useAppData: () => ({ books: [
  { id: 'book-a', driveFileId: 'book-a', fileType: 'cbz' }, { id: 'book-c', driveFileId: 'book-c', fileType: 'cbz' },
] }) }));
vi.mock('@features/books/comics/useComicLibrary', () => ({ useComicLibrary: () => ({ store: fixture.store, ...fixture.store.getSnapshot() }) }));
vi.mock('@features/reader/comic/cbzArchive', () => ({ openCbz: async () => ({ pageCount: 3, comicInfo: null, close: vi.fn() }) }));
vi.mock('@features/reader/pdfOverlay/PdfPageCanvas', () => ({ PdfPageCanvas: ({ pageNumber }: { pageNumber: number }) => <div>Page {pageNumber}</div> }));
afterEach(() => { cleanup(); localStorage.clear(); });

it('restores the saved page without writing page one over it, then persists a page turn', async () => {
  fixture.store = new ComicLibrary('device', vi.fn(), () => 'device');
  fixture.store.edit('progress:book-a', { page: 2, pageCount: 3, status: 'reading', updatedAt: 1 });
  function Reader() { const [page, setPage] = useState(1); return <><button onClick={() => setPage(3)}>Turn page</button><CbzViewer data={fixture.bytes} documentId="book-a" currentPage={page} onCurrentPageChange={setPage} /></>; }
  render(<MemoryRouter><Reader /></MemoryRouter>);
  await screen.findByText('Page 2');
  expect(fixture.store.getSnapshot().pending).toBe(1);
  fireEvent.click(screen.getByText('Turn page'));
  await waitFor(() => expect(fixture.store.value('progress:book-a')).toMatchObject({ page: 3 }));
  fireEvent.click(screen.getByText('Finish chapter'));
  expect(fixture.store.value('progress:book-a')).toMatchObject({ page: 3, status: 'read' });
});

it('next chapter skips records whose files are no longer in the library', async () => {
  fixture.store = new ComicLibrary('device', vi.fn(), () => 'device');
  ['a', 'b', 'c'].forEach((id, index) => fixture.store.edit(`chapter:book-${id}`, { seriesId: 'series', title: id, number: String(index) }));
  render(<MemoryRouter><CbzViewer data={fixture.bytes} documentId="book-a" currentPage={1} /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Next chapter'));
  expect(fixture.navigate).toHaveBeenCalledWith('/book/book-c');
});

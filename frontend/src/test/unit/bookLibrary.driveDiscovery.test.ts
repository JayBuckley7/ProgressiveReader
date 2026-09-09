import { expect, it, vi } from 'vitest';
import { listUserBooksFromDrive } from '@features/books/services/bookLibrary/list';
const bookCache = () => ({ getBookListCache: () => null, getCachedCoverUrl: () => null, setBookListCache: vi.fn() });
it('lists Android CBZ downloads without a library metadata entry', async () => {
  const cache = bookCache();
  const drive = { isSignedIn: () => true, getMetadataFile: async () => ({ data: { books: {} } }), listFiles: async () => [
    { id: 'manga', name: 'Japanese chapter.cbz', mimeType: 'application/vnd.comicbook+zip' },
    { id: 'json', name: 'metadata.json' }, { id: 'cover', name: 'cover.jpg' },
  ] };
  const books = await listUserBooksFromDrive({ drive: drive as any, bookCache: cache as any });
  expect(books).toHaveLength(1);
  expect(books[0]).toMatchObject({ id: 'manga', driveFileId: 'manga', fileType: 'cbz', title: 'Japanese chapter' });
});
it('preserves metadata overrides and excludes records missing from Drive', async () => {
  const drive = { isSignedIn: () => true, getMetadataFile: async () => ({ data: { books: { manga: { title: 'Custom name', folderId: 'folder' }, missing: { title: 'Deleted', fileType: 'cbz' } } } }), listFiles: async () => [{ id: 'manga', name: 'chapter.cbz' }] };
  const books = await listUserBooksFromDrive({ drive: drive as any, bookCache: bookCache() as any });
  expect(books).toHaveLength(1); expect(books[0]).toMatchObject({ title: 'Custom name', folderId: 'folder' });
});
it('propagates a failed Drive listing instead of publishing an empty success', async () => {
  const cache = bookCache();
  const drive = { isSignedIn: () => true, getMetadataFile: async () => ({ data: {} }), listFiles: async () => { throw new Error('offline'); } };
  await expect(listUserBooksFromDrive({ drive: drive as any, bookCache: cache as any })).rejects.toThrow('offline');
  expect(cache.setBookListCache).not.toHaveBeenCalled();
});

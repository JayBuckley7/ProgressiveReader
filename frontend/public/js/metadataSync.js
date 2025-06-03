// metadataSync.js - synchronize metadata with IndexedDB
import { addBook, updateBookMetadata, getLocalBooksMetadata, getBook } from './dbService.js';
import * as driveSync from './driveSync.js';

/**
 * Merge remote metadata with local IndexedDB records.
 * Missing books are created with empty content blobs.
 * @returns {Promise<Array<object>>} Unified list of book metadata.
 */
export async function getMergedBooksMetadata() {
  const local = await getLocalBooksMetadata();

  let remote = [];
  try {
    const resp = await fetch('/metadata/books', {
      credentials: 'include'
    });
    if (resp.ok) remote = await resp.json();
  } catch (err) {
    console.error('[metadataSync] fetch failed:', err);
  }

  const byId = new Map(local.map(b => [b.id, { ...b, source: 'local' }]));

  for (const book of remote) {
    const { id, title, coverImageBlob, ...rest } = book;
    if (!byId.has(id)) {
      const existing = await getBook(id);
      if (!existing) {
        try {
          await addBook(title, new Blob([]), id, rest, false, true);
        } catch (err) {
          console.warn(`[MetadataSync] Skipping invalid/corrupted book ${book.id}`, err);
          continue;
        }
      }
      await updateBookMetadata(id, rest);
      byId.set(id, { id, title, ...rest, source: 'remote' });
    } else {
      await updateBookMetadata(id, rest);
      const existingLocal = byId.get(id);
      byId.set(id, { ...existingLocal, ...rest, source: 'local' });
    }
  }

  return Array.from(byId.values());
}

/**
 * Convenience wrapper to update local DB with remote metadata.
 * @param {string} userId User identifier.
 */
export async function syncMetadata() {
  await getMergedBooksMetadata();
}

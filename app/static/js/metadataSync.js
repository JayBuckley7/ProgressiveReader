// metadataSync.js - synchronize Redis metadata with IndexedDB
import { addBook, updateBookMetadata, getLocalBooksMetadata, getBook } from './dbService.js';

/**
 * Merge remote metadata from Redis with local IndexedDB records.
 * Missing books are created with empty content blobs.
 * @param {string} userId User identifier for Redis keys.
 * @returns {Promise<Array<object>>} Unified list of book metadata.
 */
export async function getMergedBooksMetadata(userId) {
  const local = await getLocalBooksMetadata();
  if (!userId) return local;

  let remote = [];
  try {
    const resp = await fetch(`/metadata/${userId}/books`);
    if (resp.ok) remote = await resp.json();
  } catch (err) {
    console.error('[metadataSync] fetch failed:', err);
  }

  const byId = new Map(local.map(b => [b.id, { ...b, source: 'local' }]));

  for (const book of remote) {
    const { id, title, ...rest } = book;
    if (!byId.has(id)) {
      const existing = await getBook(id);
      if (!existing) {
        await addBook(title, new Blob([]), id, rest);
      }
      await updateBookMetadata(id, rest);
      byId.set(id, { id, title, ...rest, source: 'redis', isRemoteOnly: true });
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
export async function syncMetadata(userId) {
  await getMergedBooksMetadata(userId);
}

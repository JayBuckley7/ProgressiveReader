import { appLog } from '@shared/appLog'
export const OFFLINE_BOOKS_KEY = 'prOfflineBooks';
import type { BookMetadata } from '~/types';
import { getCoverForFile, getCachedCover, cacheCoverForFile, cacheCover, getCachedFile } from '@integrations/googleDrive/services/driveCache';
import { gDriveService } from '@integrations/googleDrive/gdriveService';

export function getOfflineBooks(): BookMetadata[] {
  try {
    const raw = localStorage.getItem(OFFLINE_BOOKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addOfflineBook(meta: BookMetadata): void {
  const books = getOfflineBooks();
  const existingIndex = books.findIndex(b => b.id === meta.id);

  // Preserve all metadata fields to ensure cache keys (which depend on modifiedTime) match
  const bookEntry = {
    ...meta
  };

  if (existingIndex >= 0) {
    // Update existing entry (Crucial for refreshing driveFileId/timestamps)
    books[existingIndex] = bookEntry;
  } else {
    books.push(bookEntry);
  }
  localStorage.setItem(OFFLINE_BOOKS_KEY, JSON.stringify(books));
}

export function removeOfflineBook(id: string): void {
  const books = getOfflineBooks().filter(b => b.id !== id);
  localStorage.setItem(OFFLINE_BOOKS_KEY, JSON.stringify(books));
}

export async function getOfflineBooksWithCovers(): Promise<BookMetadata[]> {
  const books = getOfflineBooks();
  const result: BookMetadata[] = [];

  for (const b of books) {
    // CRITICAL: Only include books that have actual CONTENT cached.
    // Metadata alone is not enough for offline reading.
    if (b.driveFileId) {
      const hasContent = await getCachedFile(b.driveFileId);
      appLog.debug(`[Offline Library] Book "${b.title}" - driveFileId: ${b.driveFileId}, Cached: ${!!hasContent}`);
      // TEMPORARY: Disabled filter because user reported valid books being hidden.
      // if (!hasContent) {
      //   continue;
      // }
    } else {
      // If no driveFileId (e.g. local import?), maybe logic differs.
      // But for now, assume filtering.
      // continue; 
    }

    let coverUrl: string | undefined;
    if (b.coverImageId) {
      let blob = await getCoverForFile(b.id);
      if (!blob) {
        blob = await getCachedCover(b.coverImageId);
        if (!blob && gDriveService.isSignedIn()) {
          // Only try download if we think we are online
          try {
            blob = await gDriveService.downloadFile(b.coverImageId);
            if (blob) {
              await cacheCover(b.coverImageId, blob);
            }
          } catch (e) {
            // Ignore download errors in offline mode logic
          }
        }
        if (blob) {
          await cacheCoverForFile(b.id, blob);
        }
      }
      if (blob) {
        coverUrl = URL.createObjectURL(blob);
      }
    }
    result.push({ ...b, coverUrl });
  }
  return result;
}

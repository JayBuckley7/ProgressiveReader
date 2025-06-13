export const OFFLINE_BOOKS_KEY = 'prOfflineBooks';
import type { BookMetadata } from '../services/storageService';
import { getCoverForFile, getCachedCover, cacheCoverForFile } from '../services/driveCache';
import { gDriveService } from '../services/gdriveService';
import { cacheCover } from '../services/driveCache';

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
  if (!books.find(b => b.id === meta.id)) {
    books.push({
      id: meta.id,
      title: meta.title,
      fileType: meta.fileType,
      driveFileId: meta.driveFileId,
      coverImageId: meta.coverImageId,
      totalChapters: meta.totalChapters,
    } as BookMetadata);
    localStorage.setItem(OFFLINE_BOOKS_KEY, JSON.stringify(books));
  }
}

export function removeOfflineBook(id: string): void {
  const books = getOfflineBooks().filter(b => b.id !== id);
  localStorage.setItem(OFFLINE_BOOKS_KEY, JSON.stringify(books));
}

export async function getOfflineBooksWithCovers(): Promise<BookMetadata[]> {
  const books = getOfflineBooks();
  const result: BookMetadata[] = [];
  for (const b of books) {
    let coverUrl: string | undefined;
    if (b.coverImageId) {
      let blob = await getCoverForFile(b.id);
      if (!blob) {
        blob = await getCachedCover(b.coverImageId);
        if (!blob && gDriveService.isSignedIn()) {
          blob = await gDriveService.downloadFile(b.coverImageId);
          if (blob) {
            await cacheCover(b.coverImageId, blob);
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

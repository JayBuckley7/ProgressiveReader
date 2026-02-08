import { toast } from "sonner";
import type { BookMetadata } from "~/types";

import {
  addOfflineBook,
  getOfflineBooks,
  getOfflineBooksWithCovers,
} from "@features/books/utils/offlineLibrary";
import type { DriveCachePort } from "@core/drive/cachePort";
import type { DrivePort } from "@core/drive/ports";

export async function loadOfflineBooks(params: {
  setIsLoading: (v: boolean) => void;
  setBooks: (books: BookMetadata[]) => void;
  driveCache: DriveCachePort;
  drive?: DrivePort;
}) {
  const { setIsLoading, setBooks, driveCache, drive } = params;
  setIsLoading(true);
  const offline = await getOfflineBooksWithCovers({ driveCache, drive });
  setBooks(offline);
  setIsLoading(false);
}

export function hasOfflineBooksCached(): boolean {
  return getOfflineBooks().length > 0;
}

export async function cacheBookForOffline(params: {
  meta: BookMetadata;
  downloadBook: (bookId: string, metadata: BookMetadata) => Promise<Blob | null>;
  driveCache: DriveCachePort;
  drive?: DrivePort;
}) {
  const { meta, downloadBook, driveCache, drive } = params;

  const blob = await downloadBook(meta.id, meta);
  if (!blob) return;

  if (meta.coverImageId) {
    let cover = await driveCache.getCoverForFile(meta.id);
    if (!cover) {
      cover = await driveCache.getCachedCover(meta.coverImageId);
      if (!cover && drive?.isSignedIn()) {
        cover = await drive.downloadFile(meta.coverImageId);
        if (cover) {
          await driveCache.cacheCover(meta.coverImageId, cover);
        }
      }
      if (cover) {
        await driveCache.cacheCoverForFile(meta.id, cover);
      }
    }
  }

  addOfflineBook(meta);
  toast.success("Book cached for offline use");
}

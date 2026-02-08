import { toast } from "sonner";
import type { BookMetadata } from "~/types";

import { gDriveService } from "@integrations/googleDrive/gdriveService";
import {
  cacheCover,
  cacheCoverForFile,
  getCachedCover,
  getCoverForFile,
} from "@integrations/googleDrive/services/driveCache";

import {
  addOfflineBook,
  getOfflineBooks,
  getOfflineBooksWithCovers,
} from "@features/books/utils/offlineLibrary";

export async function loadOfflineBooks(params: {
  setIsLoading: (v: boolean) => void;
  setBooks: (books: BookMetadata[]) => void;
}) {
  const { setIsLoading, setBooks } = params;
  setIsLoading(true);
  const offline = await getOfflineBooksWithCovers();
  setBooks(offline);
  setIsLoading(false);
}

export function hasOfflineBooksCached(): boolean {
  return getOfflineBooks().length > 0;
}

export async function cacheBookForOffline(params: {
  meta: BookMetadata;
  downloadBook: (bookId: string, metadata: BookMetadata) => Promise<Blob | null>;
}) {
  const { meta, downloadBook } = params;

  const blob = await downloadBook(meta.id, meta);
  if (!blob) return;

  if (meta.coverImageId) {
    let cover = await getCoverForFile(meta.id);
    if (!cover) {
      cover = await getCachedCover(meta.coverImageId);
      if (!cover && gDriveService.isSignedIn()) {
        cover = await gDriveService.downloadFile(meta.coverImageId);
        if (cover) {
          await cacheCover(meta.coverImageId, cover);
        }
      }
      if (cover) {
        await cacheCoverForFile(meta.id, cover);
      }
    }
  }

  addOfflineBook(meta);
  toast.success("Book cached for offline use");
}


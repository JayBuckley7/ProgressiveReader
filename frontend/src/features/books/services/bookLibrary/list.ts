import type { BookMetadata } from "~/types";
import { gDriveService, BOOK_FILE_EXTENSIONS } from "@integrations/googleDrive/gdriveService";
import { appLog } from "@shared/appLog";
import { bookCacheService } from "../bookCache";

type MetadataFile = {
  books?: Record<string, unknown>;
  covers?: Record<string, string>;
};

type MetadataBookEntry = {
  title?: string;
  fileName?: string;
  fileType?: string;
  uploadedAt?: string;
  folderId?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceMetadataFile(value: unknown): MetadataFile {
  if (!isRecord(value)) return {};
  return {
    books: isRecord(value.books) ? (value.books as Record<string, unknown>) : undefined,
    covers: isRecord(value.covers) ? (value.covers as Record<string, string>) : undefined,
  };
}

function coerceBookEntry(value: unknown): MetadataBookEntry {
  if (!isRecord(value)) return {};
  return {
    title: typeof value.title === "string" ? value.title : undefined,
    fileName: typeof value.fileName === "string" ? value.fileName : undefined,
    fileType: typeof value.fileType === "string" ? value.fileType : undefined,
    uploadedAt: typeof value.uploadedAt === "string" ? value.uploadedAt : undefined,
    folderId: typeof value.folderId === "string" ? value.folderId : (value.folderId === null ? null : undefined),
  };
}

export async function listUserBooksFromDrive(params: {
  onCoverReady?: (bookId: string, coverUrl: string) => void;
}): Promise<BookMetadata[]> {
  const { onCoverReady } = params;

  const isJsonFileType = (fileType?: string | null) => (fileType || "").toLowerCase() === "json";

  try {
    if (!gDriveService.isSignedIn()) {
      appLog.debug("[BookLibrary] User not signed in to Google Drive");
      return [];
    }

    const cachedBooks = bookCacheService.getBookListCache();
    if (cachedBooks) {
      const cachedLibraryBooks = cachedBooks.filter((book) => !isJsonFileType(book.fileType));

      return cachedLibraryBooks.map((book) => {
        const cachedCoverUrl = bookCacheService.getCachedCoverUrl(book.id);
        const updatedBook = cachedCoverUrl ? { ...book, coverUrl: cachedCoverUrl } : book;

        if (onCoverReady && updatedBook.coverUrl) {
          onCoverReady(book.id, updatedBook.coverUrl);
        } else if (onCoverReady && !updatedBook.coverUrl && book.coverImageId) {
          bookCacheService.downloadCoverAsync(book.id, book.coverImageId, book.title, onCoverReady);
        }

        return updatedBook;
      });
    }

    const metadataInfo = await gDriveService.getMetadataFile();
    if (!metadataInfo) return [];

    const metadata = coerceMetadataFile(metadataInfo.data);
    const bookEntries = metadata.books || {};
    const coverEntries = metadata.covers || {};

    const driveFiles = await gDriveService.listFiles();
    const driveFileIds = new Set(driveFiles.map((file) => file.id));

    const books: BookMetadata[] = [];

    for (const [bookFileId, rawBookData] of Object.entries(bookEntries)) {
      const bookMeta = coerceBookEntry(rawBookData);
      const extFromMeta = (bookMeta.fileType || bookMeta.fileName?.split(".").pop() || "").toLowerCase();

      if (!BOOK_FILE_EXTENSIONS.includes(extFromMeta)) continue;
      if (isJsonFileType(extFromMeta)) continue;
      if (!driveFileIds.has(bookFileId)) continue;

      const driveFile = driveFiles.find((file) => file.id === bookFileId);
      if (!driveFile) continue;

      const coverImageId = coverEntries[bookFileId];
      const cachedCoverUrl = bookCacheService.getCachedCoverUrl(bookFileId);

      const book: BookMetadata = {
        id: bookFileId,
        title: bookMeta.title || driveFile.name.replace(/\\.[^/.]+$/, ""),
        fileType: bookMeta.fileType || driveFile.name.split(".").pop()?.toLowerCase() || "unknown",
        driveFileId: bookFileId,
        coverImageId,
        coverUrl: cachedCoverUrl || undefined,
        uploadedAt: bookMeta.uploadedAt ? new Date(bookMeta.uploadedAt) : new Date(driveFile.modifiedTime || Date.now()),
        userId: "current-user",
        cloudProvider: "google" as const,
        folderId: bookMeta.folderId || undefined,
      };

      books.push(book);

      if (coverImageId && driveFileIds.has(coverImageId) && onCoverReady) {
        if (!cachedCoverUrl) {
          void bookCacheService.downloadCoverAsync(bookFileId, coverImageId, book.title, onCoverReady);
        } else {
          onCoverReady(bookFileId, cachedCoverUrl);
        }
      }
    }

    bookCacheService.setBookListCache(books);
    return books;
  } catch (error) {
    appLog.error("[BookLibrary] Error fetching books from Google Drive", error);
    return [];
  }
}


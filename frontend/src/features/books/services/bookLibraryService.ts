import { appLog } from "@shared/appLog";
import type { BookMetadata, Folder } from "~/types";
import type { OCRProgressCallback } from "./ocrApi";
import type { BookCoverService } from "./bookCovers";
import type { ClerkUserLike } from "./bookLibrary/provider";
import { listUserBooksFromDrive } from "./bookLibrary/list";
import {
  createFolderOnDrive,
  deleteBookFromDrive,
  deleteFolderOnDrive,
  listFoldersFromDrive,
  moveBookToFolderOnDrive,
  openCloudFolderOnDrive,
  syncBooksFromDrive,
  updateBookCoverOnDrive,
  updateBookMetadataOnDrive,
  updateFolderOnDrive,
} from "./bookLibrary/manage";
import { uploadBookToDrive, wrapUploadError } from "./bookLibrary/upload";

/**
 * Book library operations that interact with user-owned cloud storage.
 *
 * This service is intentionally focused on Drive/book CRUD + folder management,
 * and delegates cover generation/lookup to BookCoverService.
 */
export class BookLibraryService {
  constructor(private covers: BookCoverService) {}

  /**
   * Upload book to user's cloud storage - NEVER to our servers.
   * Only metadata pointers are stored in our backend.
   */
  async uploadBook(
    file: File,
    meta: { title: string; fileType: string; cover?: Blob; processOCR?: boolean },
    clerkUser?: ClerkUserLike,
    onOCRProgress?: OCRProgressCallback
  ): Promise<BookMetadata> {
    try {
      return await uploadBookToDrive({ file, meta, covers: this.covers, clerkUser, onOCRProgress });
    } catch (error) {
      appLog.error("[BookLibrary] Google Drive upload failed", error);
      throw wrapUploadError(error);
    }
  }

  async getUserBooks(onCoverReady?: (bookId: string, coverUrl: string) => void): Promise<BookMetadata[]> {
    return await listUserBooksFromDrive({ onCoverReady });
  }

  async deleteBook(id: string): Promise<void> {
    await deleteBookFromDrive(id);
  }

  /**
   * Update the cover image for a book.
   * Uploads new cover to cloud storage and updates metadata.
   */
  async updateBookCover(bookId: string, coverFile: File): Promise<string> {
    return await updateBookCoverOnDrive({ bookId, coverFile });
  }

  /**
   * Update book metadata (title, author, etc.)
   */
  async updateBookMetadata(bookId: string, updates: { title?: string; author?: string }): Promise<void> {
    await updateBookMetadataOnDrive({ bookId, updates });
  }

  /**
   * Sync the user's books with their connected cloud provider.
   * Currently implemented for Google Drive only.
   */
  async syncBooks(
    clerkUser?: ClerkUserLike,
    onCoverReady?: (bookId: string, coverUrl: string) => void
  ): Promise<BookMetadata[]> {
    return await syncBooksFromDrive({ clerkUser, onCoverReady });
  }

  /**
   * Open the cloud storage folder where books are stored.
   */
  async openCloudFolder(clerkUser?: ClerkUserLike): Promise<void> {
    await openCloudFolderOnDrive(clerkUser);
  }

  // Folder management methods
  async createFolder(name: string, parentId?: string, clerkUser?: ClerkUserLike): Promise<Folder> {
    return await createFolderOnDrive(name, parentId, clerkUser);
  }

  async updateFolder(
    folderId: string,
    updates: { name?: string; parentId?: string },
    clerkUser?: ClerkUserLike
  ): Promise<Folder> {
    return await updateFolderOnDrive(folderId, updates, clerkUser);
  }

  async deleteFolder(folderId: string, clerkUser?: ClerkUserLike): Promise<void> {
    await deleteFolderOnDrive(folderId, clerkUser);
  }

  async getFolders(clerkUser?: ClerkUserLike): Promise<Folder[]> {
    return await listFoldersFromDrive(clerkUser);
  }

  async moveBookToFolder(bookId: string, folderId: string | null, clerkUser?: ClerkUserLike): Promise<void> {
    await moveBookToFolderOnDrive(bookId, folderId, clerkUser);
  }
}

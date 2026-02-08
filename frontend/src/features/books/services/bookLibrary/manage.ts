import type { BookMetadata, Folder } from "~/types";
import { gDriveService } from "@integrations/googleDrive/gdriveService";
import { authManager } from "@shared/services/authManager";
import { appLog } from "@shared/appLog";
import { bookCacheService } from "../bookCache";
import { removeCachedCover, removeCoverForFile } from "@integrations/googleDrive/services/driveCache";
import type { ClerkUserLike } from "./provider";
import { assertGoogleProvider, detectProviderFromClerkUser } from "./provider";
import { listUserBooksFromDrive } from "./list";

type MetadataFile = {
  books?: Record<string, unknown>;
  covers?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceMetadataFile(value: unknown): MetadataFile & Record<string, unknown> {
  if (!isRecord(value)) return {};
  const books = isRecord(value.books) ? (value.books as Record<string, unknown>) : undefined;
  const covers = isRecord(value.covers) ? (value.covers as Record<string, string>) : undefined;
  return { ...value, books, covers };
}

export async function deleteBookFromDrive(bookId: string): Promise<void> {
  if (!gDriveService.isSignedIn()) {
    throw new Error("User not signed in to Google Drive");
  }

  const metadataInfo = await gDriveService.getMetadataFile();
  const metadata = coerceMetadataFile(metadataInfo?.data);
  const coverImageId = metadata.covers ? metadata.covers[bookId] : undefined;

  const bookDeleteSuccess = await gDriveService.deleteFile(bookId);
  if (!bookDeleteSuccess) throw new Error("Failed to delete book file from Google Drive");

  if (coverImageId) {
    await gDriveService.deleteFile(coverImageId).catch(() => false);
  }

  await gDriveService.removeBookMetadata(bookId).catch(() => false);
  bookCacheService.clearBookListCache();
}

export async function updateBookCoverOnDrive(params: { bookId: string; coverFile: File }): Promise<string> {
  const { bookId, coverFile } = params;

  if (!gDriveService.isSignedIn()) {
    throw new Error("User not signed in to Google Drive");
  }

  const metadataInfo = await gDriveService.getMetadataFile();
  if (!metadataInfo) throw new Error("Could not access metadata file");

  const data = coerceMetadataFile(metadataInfo.data);
  const existingBookData = data.books?.[bookId];
  if (!existingBookData) throw new Error("Book not found in metadata");

  const currentCoverImageId = data.covers ? data.covers[bookId] : undefined;

  const fileName = `${bookId}-cover-${Date.now()}.${coverFile.name.split(".").pop()}`;
  const coverResult = await gDriveService.uploadFile(fileName, coverFile, coverFile.type);
  if (!coverResult?.id) throw new Error("Failed to upload new cover image to Google Drive");

  const coverImageId = coverResult.id;

  data.books = data.books || {};
  data.books[bookId] = { ...(existingBookData as Record<string, unknown>) };
  data.covers = data.covers || {};
  data.covers[bookId] = coverImageId;

  const metadataUpdateSuccess = await gDriveService.updateMetadataFile(metadataInfo.fileId, data);
  if (!metadataUpdateSuccess) {
    await gDriveService.deleteFile(coverImageId).catch(() => false);
    throw new Error("Failed to update book metadata with new cover");
  }

  await removeCoverForFile(bookId);
  if (currentCoverImageId && currentCoverImageId !== coverImageId) {
    await removeCachedCover(currentCoverImageId);
  }

  bookCacheService.clearCoverUrlCache(bookId);
  bookCacheService.clearBookListCache();

  if (currentCoverImageId && currentCoverImageId !== coverImageId) {
    await gDriveService.deleteFile(currentCoverImageId).catch(() => false);
  }

  return coverImageId;
}

export async function updateBookMetadataOnDrive(params: {
  bookId: string;
  updates: { title?: string; author?: string };
}): Promise<void> {
  const { bookId, updates } = params;

  if (!gDriveService.isSignedIn()) {
    throw new Error("User not signed in to Google Drive");
  }

  const metadataInfo = await gDriveService.getMetadataFile();
  if (!metadataInfo) throw new Error("Could not access metadata file");

  const data = coerceMetadataFile(metadataInfo.data);
  const existingBookData = data.books?.[bookId];
  if (!existingBookData) throw new Error("Book not found in metadata");

  data.books = data.books || {};
  data.books[bookId] = {
    ...(existingBookData as Record<string, unknown>),
    ...(updates.title && { title: updates.title }),
    ...(updates.author && { author: updates.author }),
  };

  const ok = await gDriveService.updateMetadataFile(metadataInfo.fileId, data);
  if (!ok) throw new Error("Failed to update book metadata");

  bookCacheService.clearBookListCache();
}

export async function syncBooksFromDrive(params: {
  clerkUser?: ClerkUserLike;
  onCoverReady?: (bookId: string, coverUrl: string) => void;
}): Promise<BookMetadata[]> {
  const { clerkUser, onCoverReady } = params;

  if (!clerkUser) {
    appLog.debug("[BookLibrary] syncBooks: No Clerk user provided, skipping sync");
    return [];
  }

  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);

  const isAuthenticated = await authManager.ensureAuthenticated();
  if (!isAuthenticated) {
    throw new Error("Google Drive authentication failed. Please connect first.");
  }

  await gDriveService.syncMetadataWithDrive();
  return await listUserBooksFromDrive({ onCoverReady });
}

export async function openCloudFolderOnDrive(clerkUser?: ClerkUserLike): Promise<void> {
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);

  if (!gDriveService.isSignedIn()) {
    throw new Error("Google Drive not connected. Please connect first.");
  }

  await gDriveService.openFolder();
}

export async function createFolderOnDrive(name: string, parentId: string | undefined, clerkUser?: ClerkUserLike): Promise<Folder> {
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  return await gDriveService.createFolder(name, parentId);
}

export async function updateFolderOnDrive(
  folderId: string,
  updates: { name?: string; parentId?: string },
  clerkUser?: ClerkUserLike
): Promise<Folder> {
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  return await gDriveService.updateFolder(folderId, updates);
}

export async function deleteFolderOnDrive(folderId: string, clerkUser?: ClerkUserLike): Promise<void> {
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  await gDriveService.deleteFolder(folderId);
}

export async function listFoldersFromDrive(clerkUser?: ClerkUserLike): Promise<Folder[]> {
  if (!clerkUser) return [];
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  return await gDriveService.getFolders();
}

export async function moveBookToFolderOnDrive(bookId: string, folderId: string | null, clerkUser?: ClerkUserLike): Promise<void> {
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  await gDriveService.moveBookToFolder(bookId, folderId);
}

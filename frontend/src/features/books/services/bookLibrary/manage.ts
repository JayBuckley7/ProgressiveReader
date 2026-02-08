import type { BookMetadata, Folder } from "~/types";
import { appLog } from "@shared/appLog";
import type { DrivePort } from "@core/drive/ports";
import type { DriveAuthPort } from "@core/drive/authPort";
import type { DriveCachePort } from "@core/drive/cachePort";
import type { BookCacheService } from "../bookCache";
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

export async function deleteBookFromDrive(args: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  driveCache: DriveCachePort;
  bookCache: BookCacheService;
  bookId: string;
}): Promise<void> {
  const { drive, driveAuth, driveCache, bookCache, bookId } = args;

  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) {
    throw new Error("User not signed in to Google Drive");
  }

  const metadataInfo = await drive.getMetadataFile();
  const metadata = coerceMetadataFile(metadataInfo?.data);
  const coverImageId = metadata.covers ? metadata.covers[bookId] : undefined;

  const bookDeleteSuccess = await drive.deleteFile(bookId);
  if (!bookDeleteSuccess) throw new Error("Failed to delete book file from Google Drive");

  if (coverImageId) {
    await drive.deleteFile(coverImageId).catch(() => false);
  }

  await drive.removeBookMetadata(bookId).catch(() => false);

  // Clear any cached blobs/URLs for this cover.
  await driveCache.removeCoverForFile(bookId).catch(() => {});
  if (coverImageId) {
    await driveCache.removeCachedCover(coverImageId).catch(() => {});
  }

  bookCache.clearBookListCache();
}

export async function updateBookCoverOnDrive(params: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  driveCache: DriveCachePort;
  bookCache: BookCacheService;
  bookId: string;
  coverFile: File;
}): Promise<string> {
  const { drive, driveAuth, driveCache, bookCache, bookId, coverFile } = params;

  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) {
    throw new Error("User not signed in to Google Drive");
  }

  const metadataInfo = await drive.getMetadataFile();
  if (!metadataInfo) throw new Error("Could not access metadata file");

  const data = coerceMetadataFile(metadataInfo.data);
  const existingBookData = data.books?.[bookId];
  if (!existingBookData) throw new Error("Book not found in metadata");

  const currentCoverImageId = data.covers ? data.covers[bookId] : undefined;

  const fileName = `${bookId}-cover-${Date.now()}.${coverFile.name.split(".").pop()}`;
  const coverResult = await drive.uploadFile(fileName, coverFile, coverFile.type);
  if (!coverResult?.id) throw new Error("Failed to upload new cover image to Google Drive");

  const coverImageId = coverResult.id;

  data.books = data.books || {};
  data.books[bookId] = { ...(existingBookData as Record<string, unknown>) };
  data.covers = data.covers || {};
  data.covers[bookId] = coverImageId;

  const metadataUpdateSuccess = await drive.updateMetadataFile(metadataInfo.fileId, data);
  if (!metadataUpdateSuccess) {
    await drive.deleteFile(coverImageId).catch(() => false);
    throw new Error("Failed to update book metadata with new cover");
  }

  await driveCache.removeCoverForFile(bookId);
  if (currentCoverImageId && currentCoverImageId !== coverImageId) {
    await driveCache.removeCachedCover(currentCoverImageId);
  }

  bookCache.clearCoverUrlCache(bookId);
  bookCache.clearBookListCache();

  if (currentCoverImageId && currentCoverImageId !== coverImageId) {
    await drive.deleteFile(currentCoverImageId).catch(() => false);
  }

  return coverImageId;
}

export async function updateBookMetadataOnDrive(params: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  bookCache: BookCacheService;
  bookId: string;
  updates: { title?: string; author?: string };
}): Promise<void> {
  const { drive, driveAuth, bookCache, bookId, updates } = params;

  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) {
    throw new Error("User not signed in to Google Drive");
  }

  const metadataInfo = await drive.getMetadataFile();
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

  const ok = await drive.updateMetadataFile(metadataInfo.fileId, data);
  if (!ok) throw new Error("Failed to update book metadata");

  bookCache.clearBookListCache();
}

export async function syncBooksFromDrive(params: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  bookCache: BookCacheService;
  clerkUser?: ClerkUserLike;
  onCoverReady?: (bookId: string, coverUrl: string) => void;
}): Promise<BookMetadata[]> {
  const { drive, driveAuth, bookCache, clerkUser, onCoverReady } = params;

  if (!clerkUser) {
    appLog.debug("[BookLibrary] syncBooks: No Clerk user provided, skipping sync");
    return [];
  }

  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);

  const isAuthenticated = await driveAuth.ensureAuthenticated();
  if (!isAuthenticated) {
    throw new Error("Google Drive authentication failed. Please connect first.");
  }

  await drive.syncMetadataWithDrive();
  return await listUserBooksFromDrive({ drive, bookCache, onCoverReady });
}

export async function openCloudFolderOnDrive(params: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  clerkUser?: ClerkUserLike;
}): Promise<void> {
  const { drive, driveAuth, clerkUser } = params;
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);

  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) {
    throw new Error("Google Drive not connected. Please connect first.");
  }

  await drive.openFolder();
}

export async function createFolderOnDrive(params: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  name: string;
  parentId?: string;
  clerkUser?: ClerkUserLike;
}): Promise<Folder> {
  const { drive, driveAuth, name, parentId, clerkUser } = params;
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) {
    throw new Error("Google Drive not connected. Please connect first.");
  }
  return await drive.createFolder(name, parentId);
}

export async function updateFolderOnDrive(
  params: {
    drive: DrivePort;
    driveAuth: DriveAuthPort;
    folderId: string;
    updates: { name?: string; parentId?: string };
    clerkUser?: ClerkUserLike;
  }
): Promise<Folder> {
  const { drive, driveAuth, folderId, updates, clerkUser } = params;
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) {
    throw new Error("Google Drive not connected. Please connect first.");
  }
  return await drive.updateFolder(folderId, updates);
}

export async function deleteFolderOnDrive(params: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  folderId: string;
  clerkUser?: ClerkUserLike;
}): Promise<void> {
  const { drive, driveAuth, folderId, clerkUser } = params;
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) {
    throw new Error("Google Drive not connected. Please connect first.");
  }
  await drive.deleteFolder(folderId);
}

export async function listFoldersFromDrive(params: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  clerkUser?: ClerkUserLike;
}): Promise<Folder[]> {
  const { drive, driveAuth, clerkUser } = params;
  if (!clerkUser) return [];
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) return [];
  return await drive.getFolders();
}

export async function moveBookToFolderOnDrive(params: {
  drive: DrivePort;
  driveAuth: DriveAuthPort;
  bookId: string;
  folderId: string | null;
  clerkUser?: ClerkUserLike;
}): Promise<void> {
  const { drive, driveAuth, bookId, folderId, clerkUser } = params;
  const provider = detectProviderFromClerkUser(clerkUser);
  assertGoogleProvider(provider);
  const authed = await driveAuth.ensureAuthenticated();
  if (!authed || !drive.isSignedIn()) {
    throw new Error("Google Drive not connected. Please connect first.");
  }
  await drive.moveBookToFolder(bookId, folderId);
}

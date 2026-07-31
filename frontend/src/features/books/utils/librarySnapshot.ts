import type { BookMetadata, Folder } from "~/types";

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_KEY_PREFIX = "progressive-reader:library-snapshot:v1:";

export type LibrarySnapshot = {
  books: BookMetadata[];
  folders: Folder[];
  savedAt: Date;
};

type StoredLibrarySnapshot = {
  version: number;
  userId: string;
  savedAt: string;
  books: Array<Omit<BookMetadata, "uploadedAt" | "coverUrl"> & { uploadedAt: string }>;
  folders: Array<Omit<Folder, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>;
};

function storageForBrowser(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function snapshotKey(userId: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function dateISOString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Cannot persist a library snapshot with an invalid date");
  }
  return date.toISOString();
}

function isStoredSnapshot(value: unknown, userId: string): value is StoredLibrarySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<StoredLibrarySnapshot>;
  return (
    snapshot.version === SNAPSHOT_VERSION &&
    snapshot.userId === userId &&
    validDate(snapshot.savedAt) &&
    Array.isArray(snapshot.books) &&
    Array.isArray(snapshot.folders) &&
    snapshot.books.every(
      (book) =>
        book &&
        typeof book === "object" &&
        typeof book.id === "string" &&
        typeof book.title === "string" &&
        typeof book.fileType === "string" &&
        validDate(book.uploadedAt)
    ) &&
    snapshot.folders.every(
      (folder) =>
        folder &&
        typeof folder === "object" &&
        typeof folder.id === "string" &&
        typeof folder.name === "string" &&
        validDate(folder.createdAt) &&
        validDate(folder.updatedAt)
    )
  );
}

export function readLibrarySnapshot(userId: string, storage?: Storage): LibrarySnapshot | null {
  const target = storageForBrowser(storage);
  if (!target) return null;

  const key = snapshotKey(userId);
  const raw = target.getItem(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredSnapshot(parsed, userId)) {
      target.removeItem(key);
      return null;
    }

    return {
      savedAt: new Date(parsed.savedAt),
      books: parsed.books.map((book) => ({
        ...book,
        uploadedAt: new Date(book.uploadedAt),
      })),
      folders: parsed.folders.map((folder) => ({
        ...folder,
        createdAt: new Date(folder.createdAt),
        updatedAt: new Date(folder.updatedAt),
      })),
    };
  } catch {
    target.removeItem(key);
    return null;
  }
}

export function writeLibrarySnapshot(
  userId: string,
  books: BookMetadata[],
  folders: Folder[],
  savedAt: Date,
  storage?: Storage
): void {
  const target = storageForBrowser(storage);
  if (!target) return;

  const snapshot: StoredLibrarySnapshot = {
    version: SNAPSHOT_VERSION,
    userId,
    savedAt: savedAt.toISOString(),
    books: books.map(({ coverUrl: _coverUrl, uploadedAt, ...book }) => ({
      ...book,
      uploadedAt: dateISOString(uploadedAt),
    })),
    folders: folders.map(({ createdAt, updatedAt, ...folder }) => ({
      ...folder,
      createdAt: dateISOString(createdAt),
      updatedAt: dateISOString(updatedAt),
    })),
  };

  target.setItem(snapshotKey(userId), JSON.stringify(snapshot));
}

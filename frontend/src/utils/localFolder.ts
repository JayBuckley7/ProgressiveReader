export const LOCAL_FOLDER_DB = 'LocalFolderDB';
export const LOCAL_FOLDER_STORE = 'folder';
export const LOCAL_FOLDER_KEY = 'handle';
export const LOCAL_FOLDER_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(LOCAL_FOLDER_DB, LOCAL_FOLDER_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOCAL_FOLDER_STORE)) {
          db.createObjectStore(LOCAL_FOLDER_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_FOLDER_STORE, 'readwrite');
    const store = tx.objectStore(LOCAL_FOLDER_STORE);
    const req = store.put(handle, LOCAL_FOLDER_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_FOLDER_STORE, 'readonly');
    const store = tx.objectStore(LOCAL_FOLDER_STORE);
    const req = store.get(LOCAL_FOLDER_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearFolderHandle(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_FOLDER_STORE, 'readwrite');
    const store = tx.objectStore(LOCAL_FOLDER_STORE);
    const req = store.delete(LOCAL_FOLDER_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

import type { BookMetadata } from '../services/storageService';
import { BOOK_FILE_EXTENSIONS } from '../services/gdriveService';

export async function loadBooksFromFolder(handle: FileSystemDirectoryHandle): Promise<BookMetadata[]> {
  const books: BookMetadata[] = [];
  for await (const entry of (handle as any).values()) {
    if (entry.kind === 'file') {
      const file = await (entry as any).getFile();
      const parts = file.name.split('.');
      const ext = parts.pop()?.toLowerCase() || '';
      if (BOOK_FILE_EXTENSIONS.includes(ext)) {
        books.push({
          id: file.name,
          title: parts.join('.'),
          fileType: ext,
          uploadedAt: new Date(file.lastModified),
          userId: 'local-folder',
          cloudProvider: 'local'
        } as BookMetadata);
      }
    }
  }
  return books;
}

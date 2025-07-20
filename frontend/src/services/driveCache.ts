// driveCache.ts - simple IndexedDB-backed cache for Google Drive files

export const CACHE_DB_NAME = 'DriveFileCache';
export const CACHE_STORE_NAME = 'files';
export const COVER_STORE_NAME = 'covers';
export const COVER_BY_FILE_STORE_NAME = 'coversByFile';
export const CACHE_DB_VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
                    db.createObjectStore(CACHE_STORE_NAME);
                }
                if (!db.objectStoreNames.contains(COVER_STORE_NAME)) {
                    db.createObjectStore(COVER_STORE_NAME);
                }
                if (!db.objectStoreNames.contains(COVER_BY_FILE_STORE_NAME)) {
                    db.createObjectStore(COVER_BY_FILE_STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    return dbPromise;
}

export async function getCachedFile(id: string): Promise<Blob | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
        const store = tx.objectStore(CACHE_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function cacheFile(id: string, blob: Blob): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CACHE_STORE_NAME);
        const req = store.put(blob, id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function getCachedCover(id: string): Promise<Blob | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(COVER_STORE_NAME, 'readonly');
        const store = tx.objectStore(COVER_STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function cacheCover(id: string, blob: Blob): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(COVER_STORE_NAME, 'readwrite');
        const store = tx.objectStore(COVER_STORE_NAME);
        const req = store.put(blob, id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function getCoverForFile(fileId: string): Promise<Blob | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(COVER_BY_FILE_STORE_NAME, 'readonly');
        const store = tx.objectStore(COVER_BY_FILE_STORE_NAME);
        const req = store.get(fileId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

export async function cacheCoverForFile(fileId: string, blob: Blob): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(COVER_BY_FILE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(COVER_BY_FILE_STORE_NAME);
        const req = store.put(blob, fileId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function removeCachedCover(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(COVER_STORE_NAME, 'readwrite');
        const store = tx.objectStore(COVER_STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function removeCoverForFile(fileId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(COVER_BY_FILE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(COVER_BY_FILE_STORE_NAME);
        const req = store.delete(fileId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

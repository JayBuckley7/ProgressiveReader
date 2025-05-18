// --- localStorage Cache Logic (Translations) --- 
function getTranslationCacheKey(bookId, itemIndex) { 
    if (bookId === null || itemIndex === null) return null;
    return `translated_page_${bookId}_${itemIndex}`; 
}

function saveTranslationToLocal(bookId, itemIndex, translatedHtml) {
    const key = getTranslationCacheKey(bookId, itemIndex);
    if (!key) return;
    try {
        localStorage.setItem(key, translatedHtml);
        console.log(`Saved translation for book ${bookId}, index ${itemIndex}.`);
    } catch (e) {
        console.error(`Error saving translation to localStorage for book ${bookId}, index ${itemIndex}:`, e);
        // Consider a more robust error handling/reporting mechanism
        // alert("Could not save translation locally. Storage might be full.");
    }
}

function loadTranslationFromLocal(bookId, itemIndex) {
    const key = getTranslationCacheKey(bookId, itemIndex);
    if (!key) return null;
    return localStorage.getItem(key); // Returns null if key doesn't exist
}

function removeTranslationFromLocal(bookId, itemIndex) {
     const key = getTranslationCacheKey(bookId, itemIndex);
     if (!key) return;
     localStorage.removeItem(key);
     console.log(`Removed translation for book ${bookId}, index ${itemIndex}.`);
}

// --- Reading Progress Management ---
import { updateLastOpened } from './dbService.js';

function saveReadingProgress(bookId, itemIndex) {
    if (bookId === null || itemIndex === null) return;
    const progressKey = `reading_progress_${bookId}`;
    const record = { index: itemIndex, dttm_mod: Date.now() };
    try {
        localStorage.setItem(progressKey, JSON.stringify(record));
    } catch (e) {
        console.error('Failed to save reading progress to localStorage:', e);
    }

    // Update last opened timestamp in IndexedDB
    if (typeof updateLastOpened === 'function') {
        updateLastOpened(bookId).catch(e => console.error('Failed to update last opened timestamp:', e));
    }

    // --- Drive Sync: queue progress upload ---
    if (window.driveService && typeof window.driveService.isConnected === 'function' && window.driveService.isConnected()) {
        try {
            window.driveService.queueProgressUpload(bookId, { cfi: itemIndex, ts: Date.now() });
        } catch (e) {
            console.error('Drive progress upload failed:', e);
        }
    }
    
    // For PWA offline sync
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        // Store in IndexedDB outbox for background sync
        storeProgressInOutbox(bookId, itemIndex);
        // Request a sync
        navigator.serviceWorker.ready.then(registration => {
            registration.sync.register('sync-reading-progress')
                .catch(err => console.error('Sync registration failed:', err));
        });
    }
}

function getReadingProgress(bookId) {
    const meta = getReadingProgressMeta(bookId);
    return meta ? meta.index : null;
}

function getReadingProgressMeta(bookId) {
    if (bookId === null) return null;
    const progressKey = `reading_progress_${bookId}`;
    const raw = localStorage.getItem(progressKey);
    if (raw === null) return null;
    try {
        const obj = JSON.parse(raw);
        if (typeof obj === 'object' && obj !== null && obj.hasOwnProperty('index')) {
            return { index: parseInt(obj.index, 10), dttm_mod: obj.dttm_mod || 0 };
        }
    } catch (e) {
        // Fall back to old format
        const idx = parseInt(raw, 10);
        if (!Number.isNaN(idx)) {
            return { index: idx, dttm_mod: 0 };
        }
    }
    return null;
}

// --- Autoload Preference ---
function getAutoloadPreference() {
    const pref = localStorage.getItem('autoload_preference');
    // Default to true (checked) if not set
    return pref === null ? true : (pref === 'true');
}

function saveAutoloadPreference(isChecked) {
    localStorage.setItem('autoload_preference', isChecked);
    // console.log("Autoload preference saved:", isChecked);
}

// --- PWA Offline Support ---
// IndexedDB for storing book data for offline access
const DB_NAME = 'progressive-reader-db';
const DB_VERSION = 1;
const STORES = {
    BOOKS: 'books',
    CONTENT: 'content',
    OUTBOX: 'outbox'
};

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = event => {
            console.error('Error opening database:', event.target.error);
            reject(event.target.error);
        };
        
        request.onsuccess = event => {
            resolve(event.target.result);
        };
        
        request.onupgradeneeded = event => {
            const db = event.target.result;
            
            // Create object stores if they don't exist
            if (!db.objectStoreNames.contains(STORES.BOOKS)) {
                db.createObjectStore(STORES.BOOKS, { keyPath: 'id' });
                console.log('Books store created');
            }
            
            if (!db.objectStoreNames.contains(STORES.CONTENT)) {
                db.createObjectStore(STORES.CONTENT, { keyPath: 'key' });
                console.log('Content store created');
            }
            
            if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
                db.createObjectStore(STORES.OUTBOX, { 
                    keyPath: 'id',
                    autoIncrement: true 
                });
                console.log('Outbox store created');
            }
        };
    });
}

// Store book data for offline access
async function storeBookForOffline(bookId, bookData) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORES.BOOKS], 'readwrite');
        const booksStore = transaction.objectStore(STORES.BOOKS);
        
        // Combine the book ID with the book data
        const bookRecord = {
            ...bookData,
            id: bookId,
            timestamp: Date.now()
        };
        
        await booksStore.put(bookRecord);
        console.log(`Book ${bookId} stored for offline access`);
        return true;
    } catch (error) {
        console.error('Error storing book for offline access:', error);
        return false;
    }
}

// Store page content for offline access
async function storePageContent(bookId, itemIndex, content) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORES.CONTENT], 'readwrite');
        const contentStore = transaction.objectStore(STORES.CONTENT);
        
        const key = `${bookId}_${itemIndex}`;
        const contentRecord = {
            key,
            bookId,
            itemIndex,
            content,
            timestamp: Date.now()
        };
        
        await contentStore.put(contentRecord);
        console.log(`Content for book ${bookId}, page ${itemIndex} stored for offline access`);
        return true;
    } catch (error) {
        console.error('Error storing page content for offline access:', error);
        return false;
    }
}

// Get book data for offline access
async function getOfflineBook(bookId) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORES.BOOKS], 'readonly');
        const booksStore = transaction.objectStore(STORES.BOOKS);
        
        return new Promise((resolve, reject) => {
            const request = booksStore.get(bookId);
            
            request.onsuccess = event => {
                resolve(event.target.result);
            };
            
            request.onerror = event => {
                console.error('Error getting book:', event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Error accessing offline book database:', error);
        return null;
    }
}

// Get page content for offline access
async function getOfflinePageContent(bookId, itemIndex) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORES.CONTENT], 'readonly');
        const contentStore = transaction.objectStore(STORES.CONTENT);
        
        const key = `${bookId}_${itemIndex}`;
        
        return new Promise((resolve, reject) => {
            const request = contentStore.get(key);
            
            request.onsuccess = event => {
                resolve(event.target.result?.content || null);
            };
            
            request.onerror = event => {
                console.error('Error getting page content:', event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Error accessing offline content database:', error);
        return null;
    }
}

// Get all books for offline access
async function getAllOfflineBooks() {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORES.BOOKS], 'readonly');
        const booksStore = transaction.objectStore(STORES.BOOKS);
        
        return new Promise((resolve, reject) => {
            const request = booksStore.getAll();
            
            request.onsuccess = event => {
                resolve(event.target.result || []);
            };
            
            request.onerror = event => {
                console.error('Error getting all books:', event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Error accessing offline books database:', error);
        return [];
    }
}

// Store reading progress in the outbox for background sync
async function storeProgressInOutbox(bookId, itemIndex) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORES.OUTBOX], 'readwrite');
        const outboxStore = transaction.objectStore(STORES.OUTBOX);
        
        const progressRecord = {
            type: 'reading_progress',
            bookId,
            itemIndex,
            timestamp: Date.now()
        };
        
        await outboxStore.add(progressRecord);
        console.log(`Reading progress for book ${bookId}, page ${itemIndex} queued for sync`);
        return true;
    } catch (error) {
        console.error('Error storing reading progress in outbox:', error);
        return false;
    }
}

// Get all records from the outbox for background sync
async function getOutboxRecords() {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORES.OUTBOX], 'readonly');
        const outboxStore = transaction.objectStore(STORES.OUTBOX);
        
        return new Promise((resolve, reject) => {
            const request = outboxStore.getAll();
            
            request.onsuccess = event => {
                resolve(event.target.result || []);
            };
            
            request.onerror = event => {
                console.error('Error getting outbox records:', event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Error accessing outbox database:', error);
        return [];
    }
}

// Remove a record from the outbox after successful sync
async function removeFromOutbox(id) {
    try {
        const db = await openDatabase();
        const transaction = db.transaction([STORES.OUTBOX], 'readwrite');
        const outboxStore = transaction.objectStore(STORES.OUTBOX);
        
        await outboxStore.delete(id);
        console.log(`Outbox record ${id} removed after successful sync`);
        return true;
    } catch (error) {
        console.error('Error removing record from outbox:', error);
        return false;
    }
}

// Merge progress data from cloud with local storage
function mergeProgress(progressObj) {
    if (!progressObj || !progressObj.bookId) return;
    const localMeta = getReadingProgressMeta(progressObj.bookId);
    const remoteTs = progressObj.ts || 0;
    if (!localMeta || remoteTs > (localMeta.dttm_mod || 0)) {
        saveReadingProgress(progressObj.bookId, progressObj.cfi);
        const key = `reading_progress_${progressObj.bookId}`;
        const record = { index: progressObj.cfi, dttm_mod: remoteTs };
        try {
            localStorage.setItem(key, JSON.stringify(record));
        } catch (e) {
            console.error('Failed to merge progress from cloud:', e);
        }
    }
}

// Check if we're currently offline
function isOffline() {
    return !navigator.onLine;
}

// New function to determine the actual starting position
async function determineActualStartingPosition(bookId) {
    if (!bookId) return 0;
    let startIndex = 0;
    let latestTimestamp = 0;

    try {
        // 1. Check IndexedDB outbox
        const outboxRecords = await getOutboxRecords(); // Assuming this gets all records
        const relevantOutboxRecords = outboxRecords.filter(
            record => record.type === 'reading_progress' && record.bookId === bookId
        );

        if (relevantOutboxRecords.length > 0) {
            const latestRecord = relevantOutboxRecords.reduce((latest, current) => {
                return (current.timestamp > (latest.timestamp || 0)) ? current : latest;
            }, {});
            if (latestRecord && latestRecord.itemIndex !== undefined) {
                startIndex = latestRecord.itemIndex;
                latestTimestamp = latestRecord.timestamp;
                console.log(`[StorageManager] Found progress in outbox for ${bookId}: page ${startIndex} (ts: ${latestTimestamp})`);
            }
        }

        // 2. Check localStorage as a fallback or if it's more recent
        const localStorageProgressMeta = getReadingProgressMeta(bookId);
        if (localStorageProgressMeta && localStorageProgressMeta.index !== undefined) {
            const localStorageTimestamp = localStorageProgressMeta.dttm_mod || 0;
            if (localStorageTimestamp > latestTimestamp) { // Only use if more recent than outbox entry
                startIndex = localStorageProgressMeta.index;
                console.log(`[StorageManager] Found more recent progress in localStorage for ${bookId}: page ${startIndex} (ts: ${localStorageTimestamp})`);
            } else if (latestTimestamp === 0) { // Or if outbox was empty
                 startIndex = localStorageProgressMeta.index;
                 console.log(`[StorageManager] Used progress from localStorage for ${bookId}: page ${startIndex} (ts: ${localStorageTimestamp}) (outbox empty/irrelevant)`);
            }
        }

    } catch (error) {
        console.error(`[StorageManager] Error determining starting position for ${bookId}:`, error);
        // Fallback to localStorage directly in case of error with outbox processing
        const localStorageProgress = getReadingProgress(bookId);
        if (localStorageProgress !== null) {
            startIndex = localStorageProgress;
        }
    }
    
    console.log(`[StorageManager] Final determined startIndex for ${bookId}: ${startIndex}`);
    return startIndex;
}

// Make functions available globally or via an object
window.storageManager = {
    // Translation cache
    getTranslationCacheKey,
    saveTranslationToLocal,
    loadTranslationFromLocal,
    removeTranslationFromLocal,
    
    // Reading progress
    saveReadingProgress,
    getReadingProgress,
    getReadingProgressMeta,
    determineActualStartingPosition,
    mergeProgress,
    
    // Preferences
    getAutoloadPreference,
    saveAutoloadPreference,
    
    // PWA offline support
    openDatabase,
    storeBookForOffline,
    storePageContent,
    getOfflineBook,
    getOfflinePageContent,
    getAllOfflineBooks,
    storeProgressInOutbox,
    getOutboxRecords,
    removeFromOutbox,
    isOffline
};

// Expose mergeProgress for DriveSync backward compatibility
window.mergeProgress = mergeProgress;

console.log("storageManager.js loaded with PWA offline support"); 

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
//         console.log(`Saved translation for book ${bookId}, index ${itemIndex}.`);
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
//      console.log(`Removed translation for book ${bookId}, index ${itemIndex}.`);
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
    if (window.driveSync && typeof window.driveSync.isConnected === 'function' && window.driveSync.isConnected()) {
        try {
            window.driveSync.queueProgressUpload(bookId, { cfi: itemIndex, ts: Date.now() });
        } catch (e) {
            console.error('Drive progress upload queue failed:', e);
        }
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
//     // console.log("Autoload preference saved:", isChecked);
}

function getPreferDueCards() {
    const pref = localStorage.getItem('prefer_due_cards');
    return pref === 'true';
}

function savePreferDueCards(isChecked) {
    localStorage.setItem('prefer_due_cards', isChecked);
}

// --- Due Cards Cache ---
const DUE_CARDS_KEY = 'due_cards_cache';
const DUE_CARDS_TS_KEY = 'due_cards_timestamp';
const DUE_CARDS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getCachedDueCards() {
    const ts = parseInt(localStorage.getItem(DUE_CARDS_TS_KEY) || '0', 10);
    if (Date.now() - ts > DUE_CARDS_TTL_MS) {
        localStorage.removeItem(DUE_CARDS_KEY);
        localStorage.removeItem(DUE_CARDS_TS_KEY);
        return null;
    }
    const data = localStorage.getItem(DUE_CARDS_KEY);
    if (!data) return null;
    try {
        return JSON.parse(data);
    } catch (err) {
        console.error('Failed to parse cached due cards:', err);
        return null;
    }
}

function saveDueCards(cards) {
    try {
        localStorage.setItem(DUE_CARDS_KEY, JSON.stringify(cards));
        localStorage.setItem(DUE_CARDS_TS_KEY, Date.now().toString());
    } catch (err) {
        console.error('Failed to save due cards:', err);
    }
}

async function prefetchDueCardsIfNeeded() {
    if (!getCachedDueCards()) {
        try {
            const resp = await fetch('/api/due_cards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (resp.ok) {
                const words = await resp.json();
                if (Array.isArray(words)) {
                    saveDueCards(words);
                }
            }
        } catch (err) {
            console.error('Failed to prefetch due cards:', err);
        }
    }
}

// --- PWA Offline Support ---
// IndexedDB for storing book data for offline access
const DB_NAME = 'progressive-reader-db';
const DB_VERSION = 1;
const STORES = {
    BOOKS: 'books',
    CONTENT: 'content'
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
//                 console.log('Books store created');
            }
            
            if (!db.objectStoreNames.contains(STORES.CONTENT)) {
                db.createObjectStore(STORES.CONTENT, { keyPath: 'key' });
//                 console.log('Content store created');
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
//         console.log(`Book ${bookId} stored for offline access`);
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
//         console.log(`Content for book ${bookId}, page ${itemIndex} stored for offline access`);
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

    try {
        const progressMeta = getReadingProgressMeta(bookId);
        if (progressMeta && progressMeta.index !== undefined) {
            startIndex = progressMeta.index;
        }
    } catch (error) {
        console.error(`[StorageManager] Error determining starting position for ${bookId}:`, error);
    }

//     console.log(`[StorageManager] Final determined startIndex for ${bookId}: ${startIndex}`);
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
    getPreferDueCards,
    savePreferDueCards,
    getCachedDueCards,
    saveDueCards,
    prefetchDueCardsIfNeeded,

    // PWA offline support
    openDatabase,
    storeBookForOffline,
    storePageContent,
    getOfflineBook,
    getOfflinePageContent,
    getAllOfflineBooks,
    isOffline
};

// Expose mergeProgress for DriveSync backward compatibility
window.mergeProgress = mergeProgress;

// console.log("storageManager.js loaded with PWA offline support"); 

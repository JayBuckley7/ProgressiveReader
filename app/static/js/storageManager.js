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
function saveReadingProgress(bookId, itemIndex) {
    if (bookId === null || itemIndex === null) return;
    const progressKey = `reading_progress_${bookId}`;
    localStorage.setItem(progressKey, itemIndex.toString());

    // --- Drive Sync: queue progress upload ---
    if (window.driveSync && typeof window.driveSync.isConnected === 'function' && window.driveSync.isConnected()) {
        try {
            window.driveSync.queueProgressUpload(bookId, { cfi: itemIndex, ts: Date.now() });
        } catch (e) {
            console.error('Drive progress upload queue failed:', e);
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
    if (bookId === null) return null;
    const progressKey = `reading_progress_${bookId}`;
    const savedIndex = localStorage.getItem(progressKey);
    return savedIndex !== null ? parseInt(savedIndex, 10) : null; // Ensure base 10
}

// --- Autoload Preference ---
function getAutoloadPreference() {
    const pref = localStorage.getItem('autoload_preference');
    // Default to true (checked) if not set
    return pref === null ? true : (pref === 'true');
}

function saveAutoloadPreference(isChecked) {
    localStorage.setItem('autoload_preference', isChecked);
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
        request.onerror = event => reject(event.target.error);
        request.onsuccess = event => resolve(event.target.result);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORES.BOOKS)) {
                db.createObjectStore(STORES.BOOKS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.CONTENT)) {
                db.createObjectStore(STORES.CONTENT, { keyPath: ['bookId', 'index'] });
            }
            if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
                db.createObjectStore(STORES.OUTBOX, { autoIncrement: true });
            }
        };
    });
}

// … (everything else in the original file remains unchanged)

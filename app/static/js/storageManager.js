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
    // console.log(`Saved reading progress for book ${bookId}: page ${itemIndex}`);
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
    // console.log("Autoload preference saved:", isChecked);
}

// Make functions available globally or via an object
window.storageManager = {
    getTranslationCacheKey,
    saveTranslationToLocal,
    loadTranslationFromLocal,
    removeTranslationFromLocal,
    saveReadingProgress,
    getReadingProgress,
    getAutoloadPreference,
    saveAutoloadPreference
};

console.log("storageManager.js loaded"); 
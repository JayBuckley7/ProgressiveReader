import { EpubProcessorWrapper } from './epubProcessor.js';
import { TextProcessorWrapper } from './textProcessor.js';
import { initializeReader } from './reader.js';
// readerInit.js
document.addEventListener('DOMContentLoaded', function() {
    console.log("Reader page DOMContentLoaded - Main Initializer Script");

    // --- Config & State from page-config JSON --- 
    const configElement = document.getElementById('page-config');
    let config = {};
    if (!configElement) {
        console.error("[ReaderInit] CRITICAL: #page-config script tag not found. Cannot initialize.");
        return;
    }
    try {
        config = JSON.parse(configElement.textContent);
    } catch (e) {
        console.error("[ReaderInit] CRITICAL: Failed to parse #page-config JSON.", e);
        return;
    }
    
    // Use values directly from the parsed config object
    const apiKeyStatusConfigured = config.openaiKeyConfigured || false;
    const serverDefaultModel = config.defaultModel || 'gpt-4o-mini';
    const currentBookId = config.bookId || null;
    const urlCurrentIndex = config.currentIndex !== null ? parseInt(config.currentIndex, 10) : null;

    // --- DEBUGGING LOGS (Keep for now) ---
    console.log("[ReaderInit] Parsed config from #page-config:", JSON.stringify(config));
    console.log("[ReaderInit] currentBookId from config:", currentBookId);
    console.log("[ReaderInit] currentBookId type from config:", typeof currentBookId);
    // --- END DEBUGGING LOGS ---

    // --- DOM Elements (only those needed directly by init or for passing) ---
    const contentArea = document.querySelector('.epub-content');
    if (!contentArea) {
        console.error("CRITICAL: .epub-content element not found. Reader cannot initialize properly.");
        return; // Stop further initialization if content area is missing
    }
    const trueOriginalServerContent = contentArea.innerHTML; // Capture pristine server content early

    // --- PWA Offline Support - Store content for offline use ---
    // MOVED: This logic will now be inside initReaderAsync after actualStartIndex is known
    // if (currentBookId && window.storageManager) {
    //     storeContentForOffline(); 
    //     if (window.storageManager.isOffline()) {
    //         showOfflineNotification();
    //     }
    // }

    // --- Initialize Managers/Modules ---
    // Utility functions should be globally available or properly imported/passed if using modules
    // Assuming appUtils, themeManager, etc., are now on window object from their respective files

    if (window.sideDrawerManager && typeof window.sideDrawerManager.initSideDrawer === 'function') {
        window.sideDrawerManager.initSideDrawer();
    } else {
        console.warn("SideDrawerManager not found or initSideDrawer is not a function.");
    }

    if (window.themeManager && typeof window.themeManager.initThemeManager === 'function') {
        window.themeManager.initThemeManager(); // themeManager handles loading its own initial theme
    } else {
        console.warn("ThemeManager not found or initThemeManager is not a function.");
    }
    
    if (window.customCssManager && typeof window.customCssManager.initCustomCssManager === 'function') {
        window.customCssManager.initCustomCssManager(); // Applies custom CSS on load
    } else {
        console.warn("CustomCssManager not found or initCustomCssManager is not a function.");
    }

    // Settings Modal needs the server default model
    if (window.settingsModalManager && typeof window.settingsModalManager.initSettingsModal === 'function') {
        window.settingsModalManager.initSettingsModal(serverDefaultModel);
    } else {
        console.warn("SettingsModalManager not found or initSettingsModal is not a function.");
    }

    if (window.fontSizeManager && typeof window.fontSizeManager.initFontSizeManager === 'function') {
        window.fontSizeManager.initFontSizeManager(); // Manages its own DOM elements like contentArea
    } else {
        console.warn("FontSizeManager not found or initFontSizeManager is not a function.");
    }

    // Translation Manager needs several pieces of page-specific data
    // MOVED: This will be initialized inside initReaderAsync
    // if (window.translationManager && typeof window.translationManager.initTranslationManager === 'function') {
    //     window.translationManager.initTranslationManager({
    //         contentAreaElement: contentArea, 
    //         currentBookId: currentBookId,
    //         pageCurrentIndex: pageCurrentIndex, // This was the undefined variable
    //         apiKeyStatusConfigured: apiKeyStatusConfigured,
    //         serverDefaultModel: serverDefaultModel,
    //         trueOriginalServerContent: trueOriginalServerContent 
    //     });
    // } else {
    //     console.warn("TranslationManager not found or initTranslationManager is not a function.");
    // }

    // JLPT Highlighter needs content area and potentially initial content state
    if (window.jlptHighlighter && typeof window.jlptHighlighter.initJlptHighlighter === 'function') {
        window.jlptHighlighter.initJlptHighlighter({
            contentAreaElement: contentArea, // Pass the actual element
            trueOriginalServerContent: trueOriginalServerContent // Pass the pristine content
        });
    } else {
        console.warn("JlptHighlighter not found or initJlptHighlighter is not a function.");
    }
    
    // --- General Page Initialization (after modules) ---
    // MOVED: Saving initial progress will be inside initReaderAsync
    // if (window.storageManager && typeof window.storageManager.saveReadingProgress === 'function') {
    //     if (currentBookId !== null && pageCurrentIndex !== null) { // pageCurrentIndex was undefined
    //         window.storageManager.saveReadingProgress(currentBookId, pageCurrentIndex);
    //     }
    // } else {
    //     console.warn("StorageManager not found, cannot save reading progress.");
    // }
    
    // --- Listen for online/offline events ---
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    console.log("Main Reader Initializer (readerInit.js) complete.");
    
    // --- Helper functions ---
    
    // Store the current page content for offline use
    function storeContentForOffline(bookIdToStore, indexToStore, contentToStore) { // Modified to accept params
        if (!window.storageManager || bookIdToStore === null || indexToStore === null) return;
        
        // Store the content using IndexedDB
        window.storageManager.storePageContent(bookIdToStore, indexToStore, contentToStore)
            .then(success => {
                if (success) {
                    console.log(`[ReaderInit] Content for book ${bookIdToStore}, page ${indexToStore} stored for offline use`);
                }
            });
        
        // Store book metadata for offline use
        const bookMetadata = {
            title: document.title, // Or get from a more reliable source if page title changes
            timestamp: Date.now()
        };
        
        window.storageManager.storeBookForOffline(bookIdToStore, bookMetadata)
            .then(success => {
                if (success) {
                    console.log(`[ReaderInit] Book ${bookIdToStore} metadata stored for offline use`);
                }
            });
    }
    
    // Handle going online
    function handleOnline() {
        console.log("App is online");
        
        // Remove offline notification if it exists
        const offlineNotification = document.querySelector('.offline-notification');
        if (offlineNotification) {
            offlineNotification.classList.remove('show');
            setTimeout(() => offlineNotification.remove(), 300);
        }
        
        // Sync any offline changes
        if (window.storageManager) {
            // Try to sync reading progress
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.sync.register('sync-reading-progress');
                });
            }
        }
    }
    
    // Handle going offline
    function handleOffline() {
        console.log("App is offline");
        showOfflineNotification();
    }
    
    // Show offline notification
    function showOfflineNotification() {
        // Check if notification already exists
        if (document.querySelector('.offline-notification')) return;
        
        const notification = document.createElement('div');
        notification.className = 'offline-notification';
        notification.textContent = 'You are currently offline. Some features may be limited.';
        document.body.appendChild(notification);
        
        // Trigger reflow to ensure the transition works
        notification.offsetHeight;
        notification.classList.add('show');
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // Asynchronously determine starting position and then initialize the reader
    async function initReaderAsync() {
        if (!currentBookId) {
            console.error("[ReaderInit] CRITICAL: currentBookId is null. Cannot initialize reader.");
            showError("Book ID is missing. Cannot load book.");
            return;
        }

        let actualStartIndex = 0;

        if (urlCurrentIndex !== null && !isNaN(urlCurrentIndex)) {
            actualStartIndex = urlCurrentIndex;
            console.log(`[ReaderInit] Using currentIndex from URL: ${actualStartIndex} for book ${currentBookId}`);
        } else {
            console.log("[ReaderInit] No valid currentIndex in URL, determining from storage...");
            if (window.storageManager && typeof window.storageManager.determineActualStartingPosition === 'function') {
                try {
                    actualStartIndex = await window.storageManager.determineActualStartingPosition(currentBookId);
                    console.log(`[ReaderInit] Determined actualStartIndex from storage: ${actualStartIndex} for book ${currentBookId}`);
                } catch (error) {
                    console.error(`[ReaderInit] Error calling determineActualStartingPosition for ${currentBookId}:`, error);
                    actualStartIndex = 0; 
                }
            } else {
                console.warn("[ReaderInit] storageManager.determineActualStartingPosition not available. Defaulting to 0.");
                actualStartIndex = 0; // Default if storageManager method not found
            }
        }

        // NOW initialize parts that needed the actualStartIndex (as pageCurrentIndex)
        if (currentBookId && window.storageManager) {
            // Pass trueOriginalServerContent which was captured when DOM was ready.
            // Note: This content might not exactly match what epub.js renders for actualStartIndex if it was different from 0.
            // This might need refinement if precise content for actualStartIndex is required for offline storage here.
            storeContentForOffline(currentBookId, actualStartIndex, trueOriginalServerContent);
            if (window.storageManager.isOffline()) {
                showOfflineNotification(); // Show offline notification if applicable
            }
        }

        if (window.translationManager && typeof window.translationManager.initTranslationManager === 'function') {
            window.translationManager.initTranslationManager({
                contentAreaElement: contentArea, 
                currentBookId: currentBookId,
                pageCurrentIndex: actualStartIndex, // Use actualStartIndex here
                apiKeyStatusConfigured: apiKeyStatusConfigured,
                serverDefaultModel: serverDefaultModel,
                trueOriginalServerContent: trueOriginalServerContent 
            });
        } else {
            console.warn("TranslationManager not found or initTranslationManager is not a function.");
        }

        if (window.storageManager && typeof window.storageManager.saveReadingProgress === 'function') {
            if (currentBookId !== null && actualStartIndex !== null) {
                window.storageManager.saveReadingProgress(currentBookId, actualStartIndex);
                console.log(`[ReaderInit] Saved initial reading progress for book ${currentBookId}, page ${actualStartIndex}`);
            }
        } else {
            console.warn("StorageManager not found, cannot save initial reading progress.");
        }

        // Prepare the initial configuration object for reader.js
        const initialConfig = {
            bookId: currentBookId,
            epubProcessor: new EpubProcessorWrapper(), // Assuming EpubProcessorWrapper is globally available or imported
            textProcessor: new TextProcessorWrapper(), // Assuming TextProcessorWrapper is globally available or imported
            storageManager: window.storageManager,     // Pass the storageManager instance
            openaiKeyConfigured: apiKeyStatusConfigured,
            defaultModel: serverDefaultModel,
            currentIndex: actualStartIndex, // Use the dynamically determined start index
            isDemo: window.IS_DEMO_MODE === true, // Check if demo mode is set
            // Add other necessary config properties that reader.js expects
            // e.g., show_jlpt_filter, jlpt_enabled might come from session via page-config if still needed
            showJlptFilter: config.showJlptFilter || false, // Get from original page config
            jlptEnabled: config.jlptEnabled || false,     // Get from original page config
        };

        if (typeof initializeReader === 'function') {
            console.log("[ReaderInit] Calling initializeReader with config:", initialConfig);
            initializeReader(initialConfig); // This function should be in reader.js
        } else {
            console.error("[ReaderInit] CRITICAL: initializeReader function not found. Reader cannot start.");
        }
    }

    // Helper for displaying errors if not already defined
    function showError(message) {
        const contentArea = document.querySelector('.epub-content');
        if (contentArea) {
            contentArea.innerHTML = `<p class="error-message">${message}</p>`;
        }
        console.error(`[ReaderInit] Error: ${message}`);
    }

    // Start the async initialization
    initReaderAsync();
}); 
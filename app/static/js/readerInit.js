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
    const currentBookId = config.bookId || null; // Ensure it defaults to null if missing
    const pageCurrentIndex = parseInt(config.currentIndex, 10) || 0;

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
    if (window.translationManager && typeof window.translationManager.initTranslationManager === 'function') {
        window.translationManager.initTranslationManager({
            contentAreaElement: contentArea, // Pass the actual element
            currentBookId: currentBookId,
            pageCurrentIndex: pageCurrentIndex,
            apiKeyStatusConfigured: apiKeyStatusConfigured,
            serverDefaultModel: serverDefaultModel,
            trueOriginalServerContent: trueOriginalServerContent // Pass the pristine content
        });
    } else {
        console.warn("TranslationManager not found or initTranslationManager is not a function.");
    }

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
    // Save current reading progress on page load (if storageManager is available)
    if (window.storageManager && typeof window.storageManager.saveReadingProgress === 'function') {
        if (currentBookId !== null && pageCurrentIndex !== null) {
            window.storageManager.saveReadingProgress(currentBookId, pageCurrentIndex);
        }
    } else {
        console.warn("StorageManager not found, cannot save reading progress.");
    }

    console.log("Main Reader Initializer (readerInit.js) complete.");
}); 
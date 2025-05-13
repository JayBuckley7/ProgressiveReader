import { ready as dbServiceReady, getBook, getProgress, saveProgress, updateLastOpened } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';

// epubViewer.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('EpubViewer: DOMContentLoaded.');

    // --- Select elements based on existing structure ---
    const viewerElement = document.querySelector('.epub-content'); // Use class selector
    // Navigation buttons (prevButton, nextButton) are no longer needed for dynamic loading.
    
    const configElement = document.getElementById('page-config');

    // --- Validate selected elements ---
    // Only viewerElement and configElement are critical now.
    if (!viewerElement || !configElement) {
        console.error("EpubViewer: Critical elements not found (viewer or config). Viewer cannot initialize.");
        if (viewerElement) viewerElement.innerHTML = "<p>Error: Core page elements missing for reader.</p>";
        else console.error("EpubViewer: .epub-content viewer element itself might be missing or page-config!");
        if (!configElement) console.error("EpubViewer: #page-config script tag missing.");
        return;
    }

    let config = {};
    try {
        config = JSON.parse(configElement.textContent);
    } catch (e) {
        console.error("EpubViewer: Failed to parse page configuration.", e);
        if (viewerElement) viewerElement.innerHTML = "<p>Error: Failed to load page configuration.</p>";
        return;
    }

    const initializeReader = async () => {
        console.log('EpubViewer: dbService is ready. Proceeding with reader initialization (simplified mode).');
        
        const bookId = config.bookId;
        let epubWrapper = null;
        let currentChapterIndex = parseInt(config.currentIndex, 10) || 0; // Use config index
        let totalChapters = 0;

        if (typeof bookId !== 'string' || bookId.length === 0) {
            console.error('EpubViewer: Invalid or missing book ID (must be a non-empty string).');
            viewerElement.innerHTML = '<p>Error: Could not load book. Invalid ID.</p>';
            return;
        }

        try {
            console.log(`EpubViewer: Fetching book with ID: ${bookId} from IndexedDB...`);
            const bookData = await getBook(bookId);

            if (!bookData) {
                viewerElement.innerHTML = `<p>Error: Book with ID ${bookId} not found in local storage.</p>`;
                return;
            }

            if (!bookData.content || !(bookData.content instanceof Blob)) {
                throw new Error('EpubViewer: Invalid book content format in database. Expected Blob or File.');
            }
            
            const bookBinaryContent = await bookData.content.arrayBuffer();
            
            console.log('EpubViewer: Creating EpubProcessorWrapper...');
            console.log(`EpubViewer: typeof EpubProcessorWrapper before instantiation: ${typeof EpubProcessorWrapper}`); 
            if (typeof EpubProcessorWrapper === 'undefined') {
                throw new Error("EpubViewer: EpubProcessorWrapper is undefined just before instantiation. Check import/export and script loading.");
            }
            epubWrapper = new EpubProcessorWrapper();
            const loadSuccess = await epubWrapper.loadBook(bookBinaryContent);
            
            if (!loadSuccess) {
                throw new Error('EpubViewer: Failed to load book with EpubProcessorWrapper.');
            }
            
            totalChapters = epubWrapper.getTotalChapters();
            if (totalChapters === 0) {
                throw new Error('EpubViewer: No readable content found in the book.');
            }

            // --- Saved Progress Logic (Determines initial currentChapterIndex) --- 
            const savedProgress = await getProgress(bookId);
            if (savedProgress && savedProgress.position !== undefined && savedProgress.position < totalChapters) {
                // Note: We are *setting* currentChapterIndex based on saved progress for this initial load.
                // The server-provided config.currentIndex is the primary source if no progress or different book context.
                // If the user navigated directly to a URL (e.g. /read/book/chapter/5), config.currentIndex will be 5.
                // This logic primarily handles resuming from the bookshelf if it directs to chapter 0 initially.
                // For robust "resume", the bookshelf link itself should point to the saved chapter.
                // However, if config.currentIndex is already the desired chapter, this might re-evaluate it.
                // Let's prioritize config.currentIndex if it's valid, and use savedProgress as a fallback or for initial "open".
                
                // If the server provided an index (config.currentIndex) different from 0, assume it's an explicit navigation.
                // Otherwise, try to use saved progress.
                if (parseInt(config.currentIndex, 10) === 0 && savedProgress.position > 0) {
                    currentChapterIndex = savedProgress.position;
                    console.log(`EpubViewer: Resuming from saved chapter index: ${currentChapterIndex} (as initial page index was 0).`);
                } else {
                    // Use the index from the URL/config if it's specific, or if savedProgress.position is 0.
                    currentChapterIndex = parseInt(config.currentIndex, 10) || 0;
                    console.log(`EpubViewer: Using chapter index from URL/config: ${currentChapterIndex}.`);
                }

            } else if (savedProgress && savedProgress.cfi) {
                // Similar logic for CFI-based resume, if config.currentIndex is 0
                if (parseInt(config.currentIndex, 10) === 0) {
                    const cfiIndex = await epubWrapper.getIndexFromCfi(savedProgress.cfi);
                    if (cfiIndex >= 0 && cfiIndex < totalChapters) {
                        currentChapterIndex = cfiIndex;
                        console.log(`EpubViewer: Resuming from saved CFI, resolved to index: ${currentChapterIndex} (as initial page index was 0).`);
                    } else {
                         currentChapterIndex = parseInt(config.currentIndex, 10) || 0;
                         console.log(`EpubViewer: Using chapter index from URL/config (CFI invalid or initial index not 0): ${currentChapterIndex}.`);
                    }
                } else {
                    currentChapterIndex = parseInt(config.currentIndex, 10) || 0;
                    console.log(`EpubViewer: Using chapter index from URL/config (initial index not 0 for CFI check): ${currentChapterIndex}.`);
                }
            } else {
                 currentChapterIndex = parseInt(config.currentIndex, 10) || 0; // Fallback to config if no saved progress
                 console.log(`EpubViewer: No valid saved progress or starting from specified index: ${currentChapterIndex}`);
            }
            
            // Validate currentChapterIndex against totalChapters
            if (currentChapterIndex < 0 || currentChapterIndex >= totalChapters) {
                console.warn(`EpubViewer: currentChapterIndex (${currentChapterIndex}) is out of bounds (0-${totalChapters-1}). Resetting to 0.`);
                currentChapterIndex = 0;
            }

            console.log(`EpubViewer: Final current chapter index for this page load: ${currentChapterIndex}`);

            // --- Save Progress and Update Last Opened Time for the CURRENTLY VIEWED page ---
            // This happens once when the page loads. Navigation is handled by server.
            saveProgress(bookId, { position: currentChapterIndex })
                .then(() => console.log(`EpubViewer: Progress saved for chapter index ${currentChapterIndex}`))
                .catch(err => console.error("Error saving progress:", err));
            
            updateLastOpened(bookId)
                .then(() => console.log(`EpubViewer: Last opened time updated for book ID ${bookId}`))
                .catch(err => console.error("Error updating last opened time:", err));

            // --- Dynamic Chapter Loading and Navigation is REMOVED ---
            // The content is already rendered by the server via `{{ content | safe }}`.
            // Navigation clicks will result in full page reloads.

            console.log('EpubViewer: Simplified reader setup complete. Page content is server-rendered. Progress saved.');

        } catch (error) {
            console.error('EpubViewer: Error loading or processing book:', error);
            viewerElement.innerHTML = `<p>Error loading book: ${error.message}. Check console.</p>`;
        }
    };

    // --- Wait for dbService (Modified) --- 
    const waitForDbService = async () => {
        console.log("EpubViewer: Waiting for dbService readiness via imported promise...");
        try {
            // Directly await the imported promise
            await dbServiceReady; 
            console.log("EpubViewer: dbService is ready (imported promise resolved).");
            initializeReader(); // Initialize reader now that DB service is confirmed ready
        } catch (error) {
            // This catch block handles rejection of the dbServiceReady promise
            console.error('EpubViewer: Error waiting for dbService to be ready:', error);
            if (viewerElement) viewerElement.innerHTML = `<p>Error: Database service failed to initialize. ${error.message || ''}</p>`;
            else console.error("EpubViewer: Viewer element missing, cannot display DB error.")
            // Re-throw the error to make the failure explicit and halt this execution path
            throw error; 
        }
        // Removed the old if/else and setTimeout logic
    };
    
    waitForDbService();
}); 
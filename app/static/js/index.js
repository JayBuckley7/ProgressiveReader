import { ready as dbReady } from './dbService.js';
import { renderBookshelf } from './bookshelfUI.js';
import { setupUploadForm } from './uploadHandler.js';

// Standardize log prefix
const logPrefix = '[IndexInit]';

/**
 * Initializes the application logic after the DOM is ready and DB service is available.
 */
async function initializeApp() {
    console.log(`${logPrefix} DOM Content Loaded. Waiting for DB service...`);

    // Get DOM elements needed (or rely on modules getting them)
    const recentBooksGrid = document.getElementById('recent-books-grid');

    try {
        await dbReady; // Wait for the dbService.ready promise to resolve
        console.log(`${logPrefix} DB service is ready.`);

        // Initial render of the bookshelf
        renderBookshelf();

        // Setup the upload form handler
        setupUploadForm();

        console.log(`${logPrefix} Application initialization complete.`);

    } catch (err) {
        console.error(`${logPrefix} Error during application initialization:`, err);
        if (recentBooksGrid) {
             recentBooksGrid.innerHTML = '<p>Error initializing application. Cannot load bookshelf.</p>';
        } else {
             alert('Critical error initializing application components.');
        }
        // Optionally disable upload form if DB failed
        const uploadButton = document.querySelector('#upload-form button');
        if (uploadButton) {
            uploadButton.disabled = true;
            uploadButton.textContent = 'Error Initializing';
        }
    }
}

// --- Execution Start ---

// Use DOMContentLoaded to ensure the HTML is parsed before running scripts
if (document.readyState === 'loading') { // Loading hasn't finished yet
    document.addEventListener('DOMContentLoaded', initializeApp);
} else { // DOMContentLoaded has already fired
    initializeApp();
} 
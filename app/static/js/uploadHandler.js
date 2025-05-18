import { addBook } from './dbService.js';
import * as driveSync from './driveSync.js';
import { renderBookshelf } from './bookshelfUI.js';
import { EpubProcessorWrapper } from './epubProcessor.js';
import { TextProcessorWrapper } from './textProcessor.js';

const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const uploadStatusDiv = document.getElementById('upload-status');
const progressContainer = document.querySelector('.upload-progress-container');
const progressBar = document.querySelector('.upload-progress-bar');

// Standardize log prefix
const logPrefix = '[UploadHandler]';

/**
 * Updates the progress bar.
 * @param {number} percentage - The progress percentage (0-100).
 */
function updateProgress(percentage) {
    if (progressBar && progressContainer) {
        progressBar.style.width = `${percentage}%`;
        // progressBar.textContent = `${percentage}%`; // Optional: show percentage text
        if (percentage > 0 && percentage < 100) {
            progressContainer.style.display = 'block';
        } else if (percentage === 100) {
            setTimeout(() => { // Hide after a short delay on completion
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%'; // Reset for next time
            }, 1000);
        } else { // 0 or error
             progressContainer.style.display = 'none';
             progressBar.style.width = '0%';
        }
    }
}

/**
 * Generates a UUID v4 (random)
 * @returns {string} UUID
 */
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Handles the EPUB file selection and initiates the upload process.
 */
async function handleFileSelect() {
    if (!fileInput || !uploadStatusDiv || !progressContainer || !progressBar) {
        console.error(`${logPrefix} Required form or progress elements not found.`);
        return;
    }

    uploadStatusDiv.textContent = ''; // Clear previous status
    uploadStatusDiv.className = ''; 
    updateProgress(0); // Reset progress bar

    if (fileInput.files.length === 0) {
        // No file selected, or selection was cancelled.
        // User might not want an error message here unless they tried to trigger something.
        return;
    }
    
    uploadStatusDiv.textContent = 'Processing...';
    updateProgress(10); // Initial progress

    const file = fileInput.files[0];
    const safeFilename = file.name.split(/[/\\]/).pop() || 'untitled';
    const extension = safeFilename.split('.').pop().toLowerCase();
    let title = safeFilename.replace(/\.[^.]+$/, '') || 'Untitled Book';

    console.log(`${logPrefix} File selected: "${title}". Attempting to process.`);

    try {
        updateProgress(25); // Starting processing

        let processor = null;
        const arrayBuffer = await file.arrayBuffer();

        if (extension === 'epub') {
            processor = new EpubProcessorWrapper();
            const loaded = await processor.loadBook(arrayBuffer);
            if (!loaded) {
                throw new Error('Failed to load EPUB file. It may be corrupted or in an invalid format.');
            }
            updateProgress(60); // EPUB loaded and parsed
            const epubTitle = processor.getBookTitle();
            if (epubTitle && epubTitle !== 'Untitled Book') {
                title = epubTitle;
            }
        } else if (extension === 'txt' || extension === 'docx' || extension === 'pdf') {
            processor = new TextProcessorWrapper();
            const loaded = await processor.loadBook(arrayBuffer, { fileType: extension });
            if (!loaded) {
                throw new Error('Failed to load text file.');
            }
            updateProgress(60); // Text loaded and parsed
        } else {
            throw new Error('Unsupported file type.');
        }
        
        // Make a symbolic "upload" call to the server for UX familiarity
        // But no actual file data is sent - just HTTP headers
        const formData = new FormData();
        const mimeType = file.type || (extension === 'epub' ? 'application/epub+zip' : 'text/plain');
        const tinyPlaceholder = new Blob([0], { type: mimeType });
        formData.append('file', tinyPlaceholder, file.name);
        
        try {
            await fetch('/book/upload', {
                method: 'POST',
                body: formData,
            });
            // We don't really care about the response - all processing happens client-side
            // This is just to maintain the "upload" mental model
            updateProgress(65); // Pretend server acknowledged upload
        } catch (uploadError) {
            console.warn(`${logPrefix} Non-critical error in symbolic server upload:`, uploadError);
            // Continue anyway since all processing is client-side
        }
       
        // Generate a client-side UUID 
        const bookId = uuidv4(); // Generate UUID client-side
        console.log(`${logPrefix} Generated book_id=${bookId}, title="${title}"`);
        
        updateProgress(75); // Starting IndexedDB storage

        const bookIdFromDB = await addBook(title, file, bookId, { fileType: extension });
        console.log(`${logPrefix} addBook to IndexedDB completed. Effective ID in DB: ${bookIdFromDB}`);
        
        // If Drive is connected, queue upload
        if (driveSync && driveSync.isConnected && driveSync.isConnected()) {
            try {
                await driveSync.queueUpload(bookIdFromDB, file);
                console.log(`${logPrefix} Queued upload for Drive`);
            } catch (err) {
                console.warn(`${logPrefix} Failed to queue Drive upload:`, err);
            }
        }
        
        updateProgress(100); // Local storage complete

        uploadStatusDiv.textContent = `Successfully uploaded "${title}"!`;
        uploadStatusDiv.className = 'hero-upload-status success-message';
        fileInput.value = ''; // Clear the input for the next selection

        // Fade out and clear success message after a delay
        setTimeout(() => {
            // Add the fade-out class to animate opacity to 0
            uploadStatusDiv.classList.add('fade-out');
            
            // Clean up after the transition completes
            uploadStatusDiv.addEventListener('transitionend', () => {
                uploadStatusDiv.textContent = '';
                uploadStatusDiv.className = 'hero-upload-status';
            }, { once: true });
        }, 3000);

        console.log(`${logPrefix} Upload successful, triggering bookshelf re-render.`);
        renderBookshelf();

    } catch (error) {
        console.error(`${logPrefix} Error processing book:`, error);
        uploadStatusDiv.textContent = `Error uploading file: ${error.message || 'Unknown error'}`;
        uploadStatusDiv.className = 'hero-upload-status error-message';
        updateProgress(0); // Reset progress on error
    }
}

/**
 * Sets up the event listener for the file input.
 */
export function setupUploadForm() {
    if (!fileInput) {
        console.error(`${logPrefix} File input element not found.`);
        return;
    }
    // Instead of form submit, listen to file input change
    fileInput.addEventListener('change', handleFileSelect);
    console.log(`${logPrefix} File input change listener attached for automatic upload.`);
    
    // Remove the old form submit listener if it was attached to uploadForm
    // No, uploadForm itself isn't strictly needed for submit anymore, but can be kept for structure
    // if (uploadForm) {
    // uploadForm.removeEventListener('submit', OLD_FUNCTION_NAME_IF_ANY);
    // }
} 
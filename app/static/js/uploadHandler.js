import { addBook } from './dbService.js';
import { renderBookshelf } from './bookshelfUI.js';

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
    const safeFilename = file.name.split(/[/\\]/).pop() || 'untitled.epub';
    const title = safeFilename.replace(/\.epub$/i, '') || 'Untitled Book';

    console.log(`${logPrefix} File selected: "${title}". Attempting to process.`);

    try {
        updateProgress(25); // Starting "server interaction"

        const formData = new FormData(); // Create a new FormData
        formData.append('file', file); // Append the file to it

        const response = await fetch('/book/upload', {
            method: 'POST',
            body: formData,
        });
        
        updateProgress(50); // Server interaction complete

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Server error details missing.' }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const serverResponse = await response.json();
        if (!serverResponse.book_id || !serverResponse.title) {
            throw new Error('Invalid response from server: missing book_id or title.');
        }

        console.log(`${logPrefix} Received from server: book_id=${serverResponse.book_id}, title=${serverResponse.title}`);
        updateProgress(75); // Starting local storage

        const bookIdFromDB = await addBook(serverResponse.title, file, serverResponse.book_id);
        console.log(`${logPrefix} addBook to IndexedDB completed. Effective ID in DB: ${bookIdFromDB}`);
        
        updateProgress(100); // Local storage complete

        uploadStatusDiv.textContent = `Successfully uploaded "${serverResponse.title}"!`;
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
        uploadStatusDiv.textContent = `Error uploading EPUB: ${error.message || 'Unknown error'}`;
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
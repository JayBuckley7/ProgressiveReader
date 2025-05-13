import { addBook } from './dbService.js';
import { renderBookshelf } from './bookshelfUI.js';

const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const uploadStatusDiv = document.getElementById('upload-status');

// Standardize log prefix
const logPrefix = '[UploadHandler]';

/**
 * Handles the submission of the EPUB upload form.
 * @param {Event} event - The form submission event.
 */
async function handleUploadSubmit(event) {
    event.preventDefault();

    if (!fileInput || !uploadStatusDiv) {
        console.error(`${logPrefix} Required form elements not found.`);
        return;
    }

    uploadStatusDiv.textContent = 'Processing...';
    uploadStatusDiv.className = ''; // Clear previous status styles

    if (fileInput.files.length === 0) {
        uploadStatusDiv.textContent = 'Please select an EPUB file.';
        uploadStatusDiv.className = 'error-message';
        return;
    }

    const file = fileInput.files[0];
    // Basic filename sanitization (remove path components, keep extension)
    const safeFilename = file.name.split(/[/\\]/).pop() || 'untitled.epub';
    const title = safeFilename.replace(/\.epub$/i, '') || 'Untitled Book';

    console.log(`${logPrefix} Attempting to add book: "${title}"`);

    try {
        // Server response should contain the book_id (UUID) and title
        const formData = new FormData(uploadForm);
        const response = await fetch('/book/upload', { // Assuming /book/upload is correct
            method: 'POST',
            body: formData, 
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Server error details missing.' }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const serverResponse = await response.json();
        if (!serverResponse.book_id || !serverResponse.title) {
            throw new Error('Invalid response from server: missing book_id or title.');
        }

        console.log(`${logPrefix} Received from server: book_id=${serverResponse.book_id}, title=${serverResponse.title}`);

        // Pass the server-generated book_id (UUID) and title to dbService.addBook
        // The file blob itself is passed for IndexedDB storage.
        const bookIdFromDB = await addBook(serverResponse.title, file, serverResponse.book_id);
        console.log(`${logPrefix} addBook to IndexedDB completed. Effective ID in DB: ${bookIdFromDB}`);

        uploadStatusDiv.textContent = `Successfully processed "${serverResponse.title}"!`;
        uploadStatusDiv.className = 'success-message';
        fileInput.value = ''; // Clear the input

        console.log(`${logPrefix} Upload successful, triggering bookshelf re-render.`);
        renderBookshelf(); // Re-render the bookshelf to show the new/updated book

    } catch (error) {
        console.error(`${logPrefix} Error adding book to IndexedDB:`, error);
        uploadStatusDiv.textContent = `Error storing EPUB: ${error.message || 'Unknown error'}`;
        uploadStatusDiv.className = 'error-message';
    }
}

/**
 * Sets up the event listener for the upload form.
 */
export function setupUploadForm() {
    if (!uploadForm) {
        console.error(`${logPrefix} Upload form element not found.`);
        return;
    }
    // dbService readiness is now handled in index.js before this is called
    uploadForm.addEventListener('submit', handleUploadSubmit);
    console.log(`${logPrefix} Upload form listener attached.`);
} 
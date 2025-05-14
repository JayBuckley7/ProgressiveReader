import { getAllBooksMetadata, deleteBook } from './dbService.js';

const recentBooksGrid = document.getElementById('recent-books-grid');

// Standardize log prefix
const logPrefix = '[BookshelfUI]';

/**
 * Renders the list of books from IndexedDB onto the bookshelf grid.
 */
export async function renderBookshelf() {
    if (!recentBooksGrid) {
        console.error(`${logPrefix} Bookshelf grid element not found.`);
        return;
    }

    // Check if we're in demo mode - check for the global variable each time we render
    const isInDemoMode = window.IS_DEMO_MODE === true;
    console.log(`${logPrefix} Demo mode detected: ${isInDemoMode}`);

    console.log(`${logPrefix} Starting render...`);
    recentBooksGrid.innerHTML = '<p>Loading bookshelf...</p>'; // Initial loading state
    recentBooksGrid.setAttribute('role', 'list'); // Set list role
    recentBooksGrid.setAttribute('aria-live', 'polite'); // Announce changes politely

    try {
        console.log(`${logPrefix} Calling getAllBooksMetadata...`);
        const booksMetadata = await getAllBooksMetadata();
        
        // Log the books before filtering
        console.log(`${logPrefix} All books before filtering:`, 
            booksMetadata.map(book => ({ 
                id: book.id, 
                title: book.title,
                isDemo: book.isDemo 
            })));
        
        // Filter out demo books if not in demo mode
        const filteredBooksMetadata = isInDemoMode 
            ? booksMetadata 
            : booksMetadata.filter(book => !book.isDemo);

        console.log(`${logPrefix} Received metadata (${booksMetadata.length} total, ${filteredBooksMetadata.length} filtered)`, filteredBooksMetadata);
        recentBooksGrid.innerHTML = ''; // Clear loading state

        if (!filteredBooksMetadata || filteredBooksMetadata.length === 0) {
            console.log(`${logPrefix} No books found.`);
            recentBooksGrid.innerHTML = '<p>Your bookshelf is empty. Upload an EPUB to get started!</p>';
            return;
        }

        // Sort books by lastOpened (desc), then title (asc)
        filteredBooksMetadata.sort((a, b) => {
            const dateA = a.lastOpened ? new Date(a.lastOpened) : new Date(0);
            const dateB = b.lastOpened ? new Date(b.lastOpened) : new Date(0);
            if (dateB - dateA !== 0) return dateB - dateA;
            return a.title.localeCompare(b.title);
        });
        console.log(`${logPrefix} Sorted metadata:`, filteredBooksMetadata);

        filteredBooksMetadata.forEach(book => {
            console.log(`${logPrefix} Processing book:`, book);
            const bookItemDiv = document.createElement('div');
            bookItemDiv.className = 'book-item';
            bookItemDiv.dataset.bookId = book.id;
            bookItemDiv.setAttribute('role', 'listitem'); // Set listitem role

            // Log before checking for the blob
            console.log(`${logPrefix} Book ID ${book.id}: Fetching cover - Blob exists? ${!!book.coverImageBlob}, Is Blob? ${book.coverImageBlob instanceof Blob}`);

            // Check for cover image Blob
            if (book.coverImageBlob && book.coverImageBlob instanceof Blob) {
                const img = document.createElement('img');
                // Create a NEW object URL for this session
                img.src = URL.createObjectURL(book.coverImageBlob); 
                img.alt = `Cover for ${book.title || 'Untitled Book'}`;
                img.loading = 'lazy'; // Lazy load images
                
                // Revoke the object URL when the image has loaded or errored to free memory
                img.onload = () => URL.revokeObjectURL(img.src);
                img.onerror = () => {
                    console.warn(`Failed to load cover image blob for book ${book.id}`);
                    URL.revokeObjectURL(img.src); 
                    // Optionally replace img with placeholder on error
                    // img.replaceWith(createPlaceholderCover()); 
                }; 
                bookItemDiv.appendChild(img);
            } else {
                // Fallback to placeholder if no cover image Blob
                const noCoverDiv = document.createElement('div');
                noCoverDiv.className = 'no-cover';
                // Improve accessibility of placeholder
                noCoverDiv.setAttribute('role', 'img'); 
                noCoverDiv.setAttribute('aria-label', 'Cover placeholder');
                noCoverDiv.textContent = 'No Cover'; 
                bookItemDiv.appendChild(noCoverDiv);
            }

            const bookLink = document.createElement('a');
            // Point to the correct reader route with the starting index 0
            bookLink.href = `/read/${book.id}/0`; 
            bookLink.textContent = book.title || 'Untitled Book';
            bookItemDiv.appendChild(bookLink);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'X';
            deleteBtn.setAttribute('aria-label', `Delete ${book.title || 'Untitled Book'}`); // Accessibility
            deleteBtn.onclick = async (e) => {
                e.stopPropagation(); // Prevent triggering link navigation
                if (confirm(`Are you sure you want to delete "${book.title}"? This cannot be undone.`)) {
                    try {
                        await deleteBook(book.id);
                        console.log(`${logPrefix} Book ${book.id} deleted from DB.`);
                        renderBookshelf(); // Re-render the shelf after deletion
                    } catch (err) {
                        console.error(`${logPrefix} Error deleting book:`, err);
                        alert(`Failed to delete book: ${err.message || 'Unknown error'}`);
                    }
                }
            };
            bookItemDiv.appendChild(deleteBtn);

            recentBooksGrid.appendChild(bookItemDiv);
        });

        console.log(`${logPrefix} Finished rendering books.`);

    } catch (error) {
        console.error(`${logPrefix} Error rendering bookshelf:`, error);
        recentBooksGrid.innerHTML = `<p>Error loading bookshelf: ${error.message || 'Unknown error'}. Check console.</p>`;
    }
} 
import { getAllBooksMetadata, deleteBook, addBook } from './dbService.js';

const recentBooksGrid = document.getElementById('recent-books-grid');

// Standardize log prefix
const logPrefix = '[BookshelfUI]';

/**
 * Renders the list of books from IndexedDB onto the bookshelf grid.
 * @param {object} driveSync - The driveSync module for checking connection status.
 */
export async function renderBookshelf(driveSync) {
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

        let remoteBooks = [];
        if (driveSync && driveSync.isConnected && driveSync.isConnected()) {
            try {
                remoteBooks = await driveSync.listRemoteBooks();
            } catch (err) {
                console.warn(`${logPrefix} Failed to list remote books:`, err);
            }
        }

        // Add remote-only entries that are not already stored locally
        const localIds = new Set(booksMetadata.map(b => b.id));
        for (const rb of remoteBooks) {
            if (!localIds.has(rb.id)) {
                booksMetadata.push({
                    id: rb.id,
                    title: rb.title,
                    lastOpened: null,
                    coverImageBlob: null,
                    isDemo: false,
                    isRemoteOnly: true
                });
            }
        }
        
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

            // Create the link element first
            const bookLink = document.createElement('a');
            bookLink.href = book.isRemoteOnly ? '#' : `/read/${book.id}/0`;
            bookLink.className = 'book-item-link'; // Add a class for potential styling
            bookLink.setAttribute('aria-label', `Read ${book.title || 'Untitled Book'}`);

            const bookItemDiv = document.createElement('div');
            bookItemDiv.className = 'book-item';
            bookItemDiv.dataset.bookId = book.id;
            if (book.isRemoteOnly) bookItemDiv.classList.add('remote');
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

            // Add title text to the book item div, not as a separate link
            const titleElement = document.createElement('p'); // Or h3, span, etc.
            titleElement.className = 'book-item-title';
            titleElement.textContent = book.title || 'Untitled Book';
            bookItemDiv.appendChild(titleElement);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&#10005;'; // Simple X symbol, or use an SVG
            deleteBtn.setAttribute('aria-label', `Delete ${book.title || 'Untitled Book'}`);
            deleteBtn.title = `Delete "${book.title}"`;
            deleteBtn.dataset.bookId = book.id; // It might be useful to have bookId here too
            deleteBtn.onclick = async (e) => {
                e.preventDefault(); 
                e.stopPropagation(); 
                if (confirm(`Are you sure you want to delete "${book.title}"? This cannot be undone.`)) {
                    try {
                        await deleteBook(book.id);
                        console.log(`${logPrefix} Book ${book.id} deleted from DB.`);
                        renderBookshelf(driveSync); // Re-render: ensure driveSync is passed here too!
                    } catch (err) {
                        console.error(`${logPrefix} Error deleting book:`, err);
                        alert(`Failed to delete book: ${err.message || 'Unknown error'}`);
                    }
                }
            };
            bookItemDiv.appendChild(deleteBtn);

            if (book.isRemoteOnly) {
                const saveBtn = document.createElement('button');
                saveBtn.className = 'btn-save-offline action-btn';
                saveBtn.textContent = 'Save Offline';
                saveBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        const blob = await driveSync.downloadBook(book.id);
                        await addBook(book.title, blob, book.id);
                        await renderBookshelf(driveSync);
                    } catch (err) {
                        console.error(`${logPrefix} Save offline failed:`, err);
                        alert('Failed to save book offline');
                    }
                });
                bookItemDiv.appendChild(saveBtn);

                bookLink.addEventListener('click', async (ev) => {
                    ev.preventDefault();
                    try {
                        const blob = await driveSync.downloadBook(book.id);
                        await addBook(book.title, blob, book.id);
                        window.location.href = `/read/${book.id}/0`;
                    } catch (err) {
                        console.error(`${logPrefix} Failed to load remote book`, err);
                        alert('Failed to load book from Drive');
                    }
                });
            }

            // Add Upload to Drive button if Drive is connected
            if (driveSync && driveSync.isConnected()) {
                const uploadDriveBtn = document.createElement('button');
                uploadDriveBtn.className = 'btn-upload-drive action-btn'; 
                uploadDriveBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" style="display: block; margin: auto;">
                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                    </svg>`;
                uploadDriveBtn.title = `Upload "${book.title}" to Google Drive`;
                uploadDriveBtn.setAttribute('aria-label', `Upload ${book.title || 'Untitled Book'} to Google Drive`);
                uploadDriveBtn.dataset.bookId = book.id;
                uploadDriveBtn.dataset.bookTitle = book.title || 'Untitled Book';
                bookItemDiv.appendChild(uploadDriveBtn);
            }

            // Append the book item div to the link, then the link to the grid
            bookLink.appendChild(bookItemDiv);
            recentBooksGrid.appendChild(bookLink);
        });

        console.log(`${logPrefix} Finished rendering books.`);

    } catch (error) {
        console.error(`${logPrefix} Error rendering bookshelf:`, error);
        recentBooksGrid.innerHTML = `<p>Error loading bookshelf: ${error.message || 'Unknown error'}. Check console.</p>`;
    }
} 
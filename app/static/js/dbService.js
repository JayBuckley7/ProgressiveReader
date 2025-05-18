import { EpubProcessorWrapper } from './epubProcessor.js';

/**
 * Handles IndexedDB operations for storing and retrieving book data locally.
 */

const DB_NAME = 'ProgressiveReaderDB';
const DB_VERSION = 1;
const BOOK_STORE_NAME = 'books';
const PROGRESS_STORE_NAME = 'progress'; // Assuming progress is stored separately

let dbPromise = null;
let dbServiceReadyPromise = null; // Promise for service readiness
let resolveDbServiceReady = null; // Resolver for the promise
let rejectDbServiceReady = null; // Rejecter for the promise

// Initialize the readiness promise
function initDbServiceReadyPromise() {
    if (!dbServiceReadyPromise) {
        dbServiceReadyPromise = new Promise((resolve, reject) => {
            resolveDbServiceReady = resolve;
            rejectDbServiceReady = reject;
        });
    }
}
initDbServiceReadyPromise(); // Call on script load

// Export the readiness promise with a clearer name
export const ready = dbServiceReadyPromise;

/**
 * Opens and initializes the IndexedDB database. Internal use.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
async function _getDB() {
    if (!dbPromise) {
        console.log('_getDB() - Creating new DB connection promise.');
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                const error = event.target.error || new Error('Unknown IndexedDB Error');
                console.error('IndexedDB error:', error);
                const errorMessage = 'Error opening IndexedDB: ' + (error?.message || 'Unknown Error');
                
                reject(new Error(errorMessage));
                
                if (rejectDbServiceReady) {
                    rejectDbServiceReady(new Error(errorMessage));
                    console.error('_getDB() - dbService readiness signaled as FAILED.');
                } else {
                    console.error('_getDB() - rejectDbServiceReady was not defined on error.');
                }
            };

            request.onsuccess = (event) => {
                console.log('_getDB() - request.onsuccess triggered.');
                const db = event.target.result;
                console.log('_getDB() - DB connection successful. Resolving promise.');
                if (resolveDbServiceReady) {
                    resolveDbServiceReady(db);
                    console.log('_getDB() - dbService readiness signaled.');
                } else {
                     console.warn('_getDB() - resolveDbServiceReady was not defined on success.');
                }
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                console.log('Upgrading IndexedDB...');
                const db = event.target.result;

                // Create Books object store
                if (!db.objectStoreNames.contains(BOOK_STORE_NAME)) {
                    const bookStore = db.createObjectStore(BOOK_STORE_NAME, {
                        keyPath: 'id', // Using the provided UUID as the key
                        // autoIncrement: true, // REMOVED: ID is now the server-provided UUID
                    });
                    // Index on title for easier lookup (still useful)
                    bookStore.createIndex('title', 'title', { unique: false }); // Title might not be unique if re-uploading the same title with a new UUID for some reason
                    // Add other indices as needed, e.g., lastOpened
                     bookStore.createIndex('lastOpened', 'lastOpened', { unique: false });
                     console.log(`Object store ${BOOK_STORE_NAME} created.`);
                } else {
                     console.log(`Object store ${BOOK_STORE_NAME} already exists.`);
                }


                // Create Progress object store (example)
                // Using 'bookId' which corresponds to the ID in the BOOK_STORE_NAME
                 if (!db.objectStoreNames.contains(PROGRESS_STORE_NAME)) {
                     const progressStore = db.createObjectStore(PROGRESS_STORE_NAME, {
                         keyPath: 'bookId'
                     });
                     // No additional indices needed for this simple example
                     console.log(`Object store ${PROGRESS_STORE_NAME} created.`);
                } else {
                     console.log(`Object store ${PROGRESS_STORE_NAME} already exists.`);
                }


                // Handle other version upgrades here if needed in the future
            };
        });
    } else {
        console.log('_getDB() - DB connection promise already exists. Waiting or using existing.');
    }
    // Ensure the promise resolves with the DB instance even if already created
    return dbPromise;
}

/**
 * Adds a book (metadata and content blob) to the IndexedDB.
 * @param {string} title - The title of the book.
 * @param {Blob} contentBlob - The EPUB file content as a Blob.
 * @param {string} serverBookId - The UUID for the book, generated by the server.
 * @param {object} [additionalMetadata={}] - Additional metadata (e.g., cover image).
 * @param {boolean} [isDemo=false] - Whether this is a demo book.
 * @returns {Promise<string>} The ID of the newly added book (which will be the serverBookId).
 */
export async function addBook(title, contentBlob, serverBookId, additionalMetadata = {}, isDemo = false) {
    if (!serverBookId) {
        throw new Error("[DBService] serverBookId is required to add a book.");
    }
    const db = await _getDB();
    let coverImageBlob = null;
    const fileType = (additionalMetadata && additionalMetadata.fileType) ? additionalMetadata.fileType : 'epub';

    // Try to extract metadata (title & cover image) before adding to DB
    if (fileType === 'epub') {
        try {
            const epubProcessor = new EpubProcessorWrapper();
            const arrayBuffer = await contentBlob.arrayBuffer();
            const loaded = await epubProcessor.loadBook(arrayBuffer);
            if (loaded) {
                const parsedTitle = epubProcessor.getBookTitle();
                if (parsedTitle && parsedTitle !== 'Untitled Book') {
                    title = parsedTitle;
                }
                coverImageBlob = await epubProcessor.getCoverBlob();
                if (coverImageBlob) {
                    console.log(`[DBService] Extracted cover image Blob for "${title}". Size: ${coverImageBlob.size}`);
                }
            } else {
                console.warn(`[DBService] EpubProcessor failed to load book "${title}" for metadata extraction.`);
            }
        } catch (error) {
            console.error(`[DBService] Error during metadata extraction for "${title}":`, error);
        }
    }

    const transaction = db.transaction(BOOK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BOOK_STORE_NAME);

    // Check for existing book using serverBookId (primary key) first.
    // Title check can be secondary if needed, but ID should be definitive.
    const existingBookRequestById = store.get(serverBookId);

    return new Promise((resolve, reject) => {
        existingBookRequestById.onsuccess = async () => {
             if (existingBookRequestById.result) {
                 console.warn(`[DBService] Book with ID (UUID) "${serverBookId}" already exists. Overwriting.`);
                 // Proceed to update/overwrite the existing entry
             } // If not found, it will proceed to add a new one.

             // Book doesn't exist, or we are overwriting. Proceed to add/update.
             const bookData = {
                id: serverBookId, // Use the server-provided UUID as the primary key
                title: title,
                content: contentBlob, // Still store the full blob
                addedDate: new Date(),
                lastOpened: null, // Initialize lastOpened timestamp
                coverImageBlob: coverImageBlob, // Store the Blob itself
                isDemo: isDemo, // Flag indicating if this is a demo book
                fileType: fileType, // From add-txt-and-docx-file-support branch
                driveId: additionalMetadata.driveId || null, // From test-deploy branch
                ...additionalMetadata // Spread any other metadata
             };

            const addRequest = store.put(bookData);

            addRequest.onsuccess = () => {
                console.log(`[DBService] Book "${title}" (ID: ${serverBookId}) added/updated in IndexedDB.`);
                resolve(serverBookId); // Returns the serverBookId
            };

            addRequest.onerror = (event) => { // Added event param
                console.error('Error adding book:', event.target.error);
                reject(new Error(`Error adding book: ${event.target.error?.message}`));
            };
        };
         existingBookRequestById.onerror = (event) => { // Changed from title check to ID check
             console.error(`[DBService] Error checking for existing book by ID ${serverBookId}:`, event.target.error);
             reject(new Error(`Error checking for existing book by ID: ${event.target.error?.message}`));
         };


        // Transaction handlers remain largely the same, but let's wrap errors
        transaction.oncomplete = () => {
            console.log(`Transaction completed for adding book "${title}".`);
        };

        transaction.onerror = (event) => { // Added event param
            console.error('Transaction error adding book:', event.target.error);
            // Reject the main promise if the transaction fails
            reject(new Error(`Transaction error adding book: ${event.target.error?.message}`));
        };
    });
}

/**
 * Retrieves a book's content and metadata by its ID.
 * @param {number} bookId - The unique ID of the book.
 * @returns {Promise<object|null>} The book object or null if not found.
 */
export async function getBook(bookId) {
    // Ensure bookId is a non-empty string
    if (typeof bookId !== 'string' || bookId.length === 0) {
         console.error('[DBService] Invalid bookId provided to getBook:', bookId);
         throw new Error('[DBService] Invalid book ID provided (must be a non-empty string).');
    }

    const db = await _getDB();
    const transaction = db.transaction(BOOK_STORE_NAME, 'readonly');
    const store = transaction.objectStore(BOOK_STORE_NAME);
    const request = store.get(bookId); // Use string ID directly

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result || null);
        };
        request.onerror = (event) => { // Added event param
            console.error('Error getting book:', event.target.error);
            reject(new Error(`Error getting book: ${event.target.error?.message}`));
        };
    });
}


/**
 * Retrieves all books' metadata (excluding content for efficiency).
 * @returns {Promise<Array<object>>} A list of book metadata objects.
 */
export async function getAllBooksMetadata() {
    const db = await _getDB();
    const transaction = db.transaction(BOOK_STORE_NAME, 'readonly');
    const store = transaction.objectStore(BOOK_STORE_NAME);
    const request = store.getAll(); // This is fine for moderate numbers of books

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            if (request.result) {
                // Explicitly map to the fields needed, including the cover Blob
                const metadataList = request.result.map(book => ({
                    id: book.id,
                    title: book.title,
                    lastOpened: book.lastOpened,
                    addedDate: book.addedDate,
                    coverImageBlob: book.coverImageBlob,
                    isDemo: book.isDemo || false,
                    fileType: book.fileType || 'epub'
                }));
               
                // Log demo books for debugging
                const demoBooks = metadataList.filter(book => book.isDemo);
                console.log(`[DBService] Found ${demoBooks.length} demo books:`, 
                    demoBooks.map(book => ({ id: book.id, title: book.title })));
               
                resolve(metadataList);
            } else {
                resolve([]); // Return empty array if result is undefined/null
            }
        };
        request.onerror = (event) => { // Added event param
            console.error('Error getting all books metadata:', event.target.error);
            reject(new Error(`Error getting all books metadata: ${event.target.error?.message}`));
        };
    });
}

/**
 * Deletes a book by its ID. Also deletes associated progress.
 * @param {number} bookId - The unique ID of the book.
 * @returns {Promise<void>}
 */
export async function deleteBook(bookId) {
     // bookId is expected to be the UUID string here
     if (typeof bookId !== 'string' || bookId.length === 0) {
         console.error('[DBService] Invalid bookId provided to deleteBook:', bookId);
         throw new Error('[DBService] Invalid book ID provided for deletion (must be a non-empty string).');
     }

    const db = await _getDB();
    // Use a single transaction for both stores
    const transaction = db.transaction([BOOK_STORE_NAME, PROGRESS_STORE_NAME], 'readwrite');
    const bookStore = transaction.objectStore(BOOK_STORE_NAME);
    const progressStore = transaction.objectStore(PROGRESS_STORE_NAME);

    const deleteBookRequest = bookStore.delete(bookId); // Use numeric ID
    const deleteProgressRequest = progressStore.delete(bookId); // Progress uses bookId as key

    // Promise for IndexedDB deletion part
    const indexedDbDeletePromise = new Promise((resolveIdxDb, rejectIdxDb) => {
        transaction.oncomplete = () => {
             console.log(`[DBService] Transaction completed for deleting book ID ${bookId} from IndexedDB.`);
             resolveIdxDb();
        };
        transaction.onerror = (event) => {
             console.error(`[DBService] Transaction error deleting book ${bookId} from IndexedDB:`, event.target.error);
             rejectIdxDb(new Error(`Transaction error deleting book from IndexedDB: ${event.target.error?.message}`));
        };

        // Individual request errors are mostly for logging, transaction outcome is key
        deleteBookRequest.onerror = (event) => {
             console.error(`[DBService] Error detail: Book store delete request for ${bookId} failed:`, event.target.error);
        };
        deleteProgressRequest.onerror = (event) => {
             console.warn(`[DBService] Note: Progress store delete request for ${bookId} failed (may not exist):`, event.target.error);
         };
    });

    try {
        await indexedDbDeletePromise;
        console.log(`[DBService] Successfully deleted book ${bookId} from IndexedDB. Now attempting server-side deletion.`);

        // Now, attempt to delete from server
        const serverDeleteResponse = await fetch(`/book/delete/${bookId}`, {
            method: 'POST',
            headers: {
                // Add any necessary headers, e.g., CSRF token if your app uses them
                'Content-Type': 'application/json' 
            }
        });

        if (serverDeleteResponse.ok) {
            const result = await serverDeleteResponse.json();
            if (result.success) {
                console.log(`[DBService] Successfully deleted book ${bookId} from server.`);
            } else {
                console.warn(`[DBService] Server indicated issue deleting book ${bookId}: ${result.message}`);
                // Decide if this should be a soft failure or throw an error
                // For now, log a warning, as client-side data is gone.
            }
        } else {
            const errorText = await serverDeleteResponse.text();
            console.error(`[DBService] Failed to delete book ${bookId} from server. Status: ${serverDeleteResponse.status}. Response: ${errorText}`);
            // Decide if this should throw an error, blocking UI update, or just log
            // Throwing will make it clearer in bookshelfUI if server fails.
            throw new Error(`Server failed to delete book files (status ${serverDeleteResponse.status}).`);
        }
        // If we reach here, both IndexedDB and server deletion (or attempted deletion with warning) are done.
        return; // Resolve the main promise successfully

    } catch (error) {
        console.error(`[DBService] Overall error in deleteBook for ${bookId}:`, error);
        throw error; // Re-throw the error to be caught by the caller (e.g., bookshelfUI)
    }
}


/**
 * Updates the last opened timestamp for a book.
 * @param {number} bookId - The ID of the book to update.
 * @returns {Promise<void>}
 */
export async function updateLastOpened(bookId) {
     // Ensure bookId is a non-empty string
     if (typeof bookId !== 'string' || bookId.length === 0) {
         console.error('[DBService] Invalid bookId provided to updateLastOpened:', bookId);
         throw new Error('[DBService] Invalid book ID provided for update (must be a non-empty string).');
     }

    const db = await _getDB();
    const transaction = db.transaction(BOOK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BOOK_STORE_NAME);
    const getRequest = store.get(bookId); // Use string ID directly

    return new Promise((resolve, reject) => {
        getRequest.onsuccess = () => {
            const bookData = getRequest.result;
            if (bookData) {
                bookData.lastOpened = new Date();
                const updateRequest = store.put(bookData);

                updateRequest.onsuccess = () => {
                    console.log(`Last opened timestamp updated for book ID ${bookId}`);
                    resolve();
                };
                updateRequest.onerror = (event) => {
                    console.error(`Error updating last opened for book ID ${bookId}:`, event.target.error);
                    reject(new Error(`Error updating last opened timestamp: ${event.target.error?.message}`));
                };
            } else {
                console.warn(`Book not found with ID ${bookId} when trying to update last opened time.`);
                resolve();
            }
        };
        getRequest.onerror = (event) => {
            console.error(`Error fetching book ID ${bookId} to update last opened time:`, event.target.error);
            reject(new Error(`Error fetching book to update last opened time: ${event.target.error?.message}`));
        };

         transaction.onerror = (event) => { // Catch transaction errors too
             console.error(`Transaction error updating last opened for book ID ${bookId}:`, event.target.error);
             reject(new Error(`Transaction error updating last opened timestamp: ${event.target.error?.message}`));
         };
    });
}

/**
 * Update arbitrary metadata fields for a book.
 * @param {string} bookId - Book ID.
 * @param {object} updates - Fields to merge into the existing record.
 * @returns {Promise<boolean>} Resolves true if updated, false if book not found.
 */
export async function updateBookMetadata(bookId, updates = {}) {
    if (typeof bookId !== 'string' || bookId.length === 0) {
        console.error('[DBService] Invalid bookId provided to updateBookMetadata:', bookId);
        throw new Error('[DBService] Invalid book ID for metadata update.');
    }
    const db = await _getDB();
    const tx = db.transaction(BOOK_STORE_NAME, 'readwrite');
    const store = tx.objectStore(BOOK_STORE_NAME);
    const getReq = store.get(bookId);
    return new Promise((resolve, reject) => {
        getReq.onsuccess = () => {
            const data = getReq.result;
            if (!data) { resolve(false); return; }
            Object.assign(data, updates);
            const putReq = store.put(data);
            putReq.onsuccess = () => resolve(true);
            putReq.onerror = e => reject(new Error(`Error updating book metadata: ${e.target.error?.message}`));
        };
        getReq.onerror = e => reject(new Error(`Error fetching book for metadata update: ${e.target.error?.message}`));
    });
}

/**
 * Replace a book's cover image.
 * @param {string} bookId - ID of the book to update.
 * @param {Blob} coverBlob - Image blob to store as the cover.
 * @returns {Promise<boolean>} Resolves true if the cover was updated.
 */
export async function updateBookCover(bookId, coverBlob) {
    return updateBookMetadata(bookId, { coverImageBlob: coverBlob });
}


/**
 * Saves reading progress for a book.
 * @param {number} bookId - The ID of the book.
 * @param {object} progressData - An object containing progress details (e.g., CFI, percentage).
 * @returns {Promise<void>}
 */
export async function saveProgress(bookId, progressData) {
     // Ensure bookId is a non-empty string
     if (typeof bookId !== 'string' || bookId.length === 0) {
         console.error('[DBService] Invalid bookId provided to saveProgress:', bookId);
         throw new Error('[DBService] Invalid book ID provided for saving progress (must be a non-empty string).');
     }

    const db = await _getDB();
    const transaction = db.transaction(PROGRESS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PROGRESS_STORE_NAME);

    const dataToStore = {
        bookId: bookId, // Key path - Use string ID directly
        ...progressData,
        lastSaved: new Date()
    };

    const request = store.put(dataToStore);

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            console.log(`Progress saved for book ID ${bookId}`);
            resolve();
        };
        request.onerror = (event) => {
            console.error(`Error saving progress for book ID ${bookId}:`, event.target.error);
            reject(new Error(`Error saving progress: ${event.target.error?.message}`));
        };

         transaction.onerror = (event) => {
             console.error(`Transaction error saving progress for book ID ${bookId}:`, event.target.error);
             reject(new Error(`Transaction error saving progress: ${event.target.error?.message}`));
         };
    });
}

/**
 * Retrieves reading progress for a book.
 * @param {number} bookId - The ID of the book.
 * @returns {Promise<object|null>} The progress object or null if not found.
 */
export async function getProgress(bookId) {
     // Ensure bookId is a non-empty string
     if (typeof bookId !== 'string' || bookId.length === 0) {
         console.error('[DBService] Invalid bookId provided to getProgress:', bookId);
         throw new Error('[DBService] Invalid book ID provided for getting progress (must be a non-empty string).');
     }

    const db = await _getDB();
    const transaction = db.transaction(PROGRESS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(PROGRESS_STORE_NAME);
    const request = store.get(bookId); // Get by key (string bookId)

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result || null);
        };
        request.onerror = (event) => {
            console.error(`Error getting progress for book ID ${bookId}:`, event.target.error);
            reject(new Error(`Error getting progress: ${event.target.error?.message}`));
        };
    });
}


// --- Utility to clear all data (for development/testing) ---

/**
 * Clears all object stores in the database. USE WITH CAUTION.
 * @returns {Promise<void>}
 */
export async function clearAllData() {
    console.warn("Clearing all data from IndexedDB!");
    const db = await _getDB();
    const transaction = db.transaction([BOOK_STORE_NAME, PROGRESS_STORE_NAME], 'readwrite');
    const bookStore = transaction.objectStore(BOOK_STORE_NAME);
    const progressStore = transaction.objectStore(PROGRESS_STORE_NAME);

    const clearBooksRequest = bookStore.clear();
    const clearProgressRequest = progressStore.clear();

     return new Promise((resolve, reject) => {
        let booksCleared = false;
        let progressCleared = false;

         clearBooksRequest.onsuccess = () => { booksCleared = true; console.log("Book store cleared."); };
         clearBooksRequest.onerror = (event) => { console.error("Error clearing book store:", event.target.error); };

         clearProgressRequest.onsuccess = () => { progressCleared = true; console.log("Progress store cleared."); };
         clearProgressRequest.onerror = (event) => { console.error("Error clearing progress store:", event.target.error); };

         transaction.oncomplete = () => {
             if (booksCleared && progressCleared) {
                 console.log("All data cleared successfully.");
                 resolve();
             } else {
                  console.error("Transaction completed, but one or more stores may not have cleared.");
                  reject(new Error("Failed to clear one or more data stores."));
             }
         };
         transaction.onerror = (event) => {
             console.error("Transaction error during clear all data:", event.target.error);
             reject(new Error(`Transaction error clearing data: ${event.target.error?.message}`));
         };
     });
}

// --- Initialize DB Connection ---
_getDB().then(() => {
    console.log("Initial DB connection attempt finished (or already connected).");
}).catch(error => {
     console.error("Initial DB connection failed:", error);
});
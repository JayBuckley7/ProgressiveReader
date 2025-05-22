import { getLocalBooksMetadata, deleteBook, addBook, updateBookCover, getBook } from './dbService.js';
import { getMergedBooksMetadata, syncMetadata } from './metadataSync.js';
import { EpubProcessorWrapper } from './epubProcessor.js';
import { createBookItem } from './bookitem.js';

const recentBooksGrid = document.getElementById("recent-books-grid");
const logPrefix = "[BookshelfUI]";

async function openBookAtProgress(bookId, title) {
  let startIndex = 0;
  try {
    startIndex = await window.storageManager.determineActualStartingPosition(bookId);
  } catch (err) {
    console.warn(`${logPrefix} Failed to determine start index for ${bookId}:`, err);
  }
  window.location.href = `/read/${bookId}/${startIndex}`;
}

/**
 * Render the bookshelf grid.
 * @param {object} driveSync  Optional Google Drive sync helper implementing
 *                            isConnected(), listRemoteBooks(), downloadBook(),
 *                            deleteRemoteBook(), uploadBookToDrive().
 * @param {string} searchQuery Optional search string to filter titles.
 */
export async function renderBookshelf(driveSync, searchQuery = "") {
  if (!recentBooksGrid) {
    console.error(`${logPrefix} Bookshelf grid element not found.`);
    return;
  }

  const isInDemoMode = window.IS_DEMO_MODE === true;

  recentBooksGrid.innerHTML = '<p>Loading bookshelf…</p>';
  recentBooksGrid.setAttribute('role', 'list');
  recentBooksGrid.setAttribute('aria-live', 'polite');

  try {
    /* ─────────────────────────────────────────────────────
       1  Gather metadata (local + remote)                  
       ───────────────────────────────────────────────────*/

    const userId = driveSync?.getUserProfile?.()?.email || null;

    if (userId && driveSync?.isConnected?.()) {
      console.log(`${logPrefix} Fetching books from redis`);
      await syncMetadata(userId);
    }

    const booksMetadata = userId
      ? await getMergedBooksMetadata(userId)
      : await getLocalBooksMetadata();

    if (userId) {
      const remoteOnly = booksMetadata.filter(b => b.isRemoteOnly).length;
      console.log(`${logPrefix} Redis metadata returned, grabbing ${remoteOnly} books from google drive`);
    }

    /* ─────────────────────────────────────────────────────
       2  Filter + sort                                     
       ───────────────────────────────────────────────────*/

    let filtered = isInDemoMode ? booksMetadata : booksMetadata.filter((b) => !b.isDemo);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((b) => (b.title || '').toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
      recentBooksGrid.innerHTML = '<p>Your bookshelf is empty. Upload a document file to get started!</p>';
      return;
    }

    filtered.sort((a, b) => {
      const aDate = a.lastOpened ? new Date(a.lastOpened) : new Date(0);
      const bDate = b.lastOpened ? new Date(b.lastOpened) : new Date(0);
      return bDate - aDate || a.title.localeCompare(b.title);
    });

    /* ─────────────────────────────────────────────────────
       3  Render every book                                 
       ───────────────────────────────────────────────────*/

    recentBooksGrid.innerHTML = '';

    filtered.forEach((book) => {
      // Create book item using the new function
      const bookElement = createBookItem(book, driveSync, renderBookshelf, openBookAtProgress);
      recentBooksGrid.appendChild(bookElement);
    });
  } catch (error) {
    console.error(`${logPrefix} Error rendering bookshelf:`, error);
    recentBooksGrid.innerHTML = `<p>Error loading bookshelf: ${error.message || 'Unknown error'}. Check console.</p>`;
  }
}

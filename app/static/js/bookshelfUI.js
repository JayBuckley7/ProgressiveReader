import { getAllBooksMetadata, deleteBook, addBook, updateBookCover } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';

const recentBooksGrid = document.getElementById("recent-books-grid");
const logPrefix = "[BookshelfUI]";

// Keep track of the last set of books we rendered so we can avoid
// re-building the DOM when nothing has changed.
let lastRenderedSnapshot = null;
let lastRenderedQuery = "";

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
 *                            deleteRemoteBook(), uploadBook().
 * @param {string} searchQuery Optional search string to filter titles.
 */
export async function renderBookshelf(driveSync, searchQuery = "") {
  if (!recentBooksGrid) {
    console.error(`${logPrefix} Bookshelf grid element not found.`);
    return;
  }

  const isInDemoMode = window.IS_DEMO_MODE === true;

  try {
    /* ─────────────────────────────────────────────────────
       1  Gather metadata (local + remote)                  
       ───────────────────────────────────────────────────*/

    const booksMetadata = await getAllBooksMetadata();

    let remoteBooks = [];
    if (driveSync?.isConnected?.()) {
      try {
        remoteBooks = await driveSync.listRemoteBooks();
      } catch (err) {
        console.warn(`${logPrefix} Failed to list remote books:`, err);
      }
    }

    // Merge remote‑only entries
    const localIds = new Set();
    booksMetadata.forEach((b) => {
      localIds.add(b.id);
      if (b.driveId) localIds.add(b.driveId);
    });
    for (const rb of remoteBooks) {
      if (!localIds.has(rb.id)) {
        booksMetadata.push({
          id: rb.id,
          title: rb.title,
          lastOpened: null,
          coverImageBlob: null,
          isDemo: false,
          isRemoteOnly: true,
          driveId: rb.id,
        });
      }
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
      const snapshot = "empty";
      if (snapshot === lastRenderedSnapshot && searchQuery === lastRenderedQuery) {
        return; // No change from last render
      }
      lastRenderedSnapshot = snapshot;
      lastRenderedQuery = searchQuery;
      recentBooksGrid.innerHTML = '<p>Your bookshelf is empty. Upload a document file to get started!</p>';
      recentBooksGrid.setAttribute('role', 'list');
      recentBooksGrid.setAttribute('aria-live', 'polite');
      return;
    }

    filtered.sort((a, b) => {
      const aDate = a.lastOpened ? new Date(a.lastOpened) : new Date(0);
      const bDate = b.lastOpened ? new Date(b.lastOpened) : new Date(0);
      return bDate - aDate || a.title.localeCompare(b.title);
    });

    const snapshot = JSON.stringify(
      filtered.map((b) => ({
        id: b.id,
        title: b.title,
        lastOpened: b.lastOpened,
        driveId: b.driveId,
        isRemoteOnly: !!b.isRemoteOnly,
      })),
    );
    if (snapshot === lastRenderedSnapshot && searchQuery === lastRenderedQuery) {
      return; // Skip render if nothing changed
    }
    lastRenderedSnapshot = snapshot;
    lastRenderedQuery = searchQuery;

    recentBooksGrid.setAttribute('role', 'list');
    recentBooksGrid.setAttribute('aria-live', 'polite');

    /* ─────────────────────────────────────────────────────
       3  Render every book                                 
       ───────────────────────────────────────────────────*/

    recentBooksGrid.innerHTML = '';

    filtered.forEach((book) => {
      // Determine start spine index (reading progress)
      // let startIndex = 0; // No longer needed here for href
      // if (window.storageManager?.getReadingProgress) {
      //   const saved = window.storageManager.getReadingProgress(book.id);
      //   if (saved !== null) startIndex = saved;
      // }

      // Wrapper link
      const bookLink = document.createElement('a');
      bookLink.href = '#'; // Navigation is handled by click handler
      bookLink.className = 'book-item-link';
      bookLink.setAttribute('aria-label', `Read ${book.title || 'Untitled Book'}`);

      // Container div
      const item = document.createElement('div');
      item.className = 'book-item';
      item.dataset.bookId = book.id;
      if (book.isRemoteOnly) item.classList.add('remote');
      item.setAttribute('role', 'listitem');

      /* ─ Cover image ─ */
      const injectCover = (blob) => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.alt = `Cover for ${book.title || 'Untitled Book'}`;
        img.loading = 'lazy';
        img.onload = img.onerror = () => URL.revokeObjectURL(img.src);
        item.appendChild(img);
      };

      if (book.coverImageBlob instanceof Blob) {
        injectCover(book.coverImageBlob);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'no-cover';
        placeholder.setAttribute('role', 'img');
        placeholder.setAttribute('aria-label', 'Cover placeholder');
        placeholder.textContent = 'No Cover';
        item.appendChild(placeholder);

        // Try fetching cover from Drive
        if (book.isRemoteOnly && driveSync?.isConnected?.()) {
          (async () => {
            try {
              const blob = await driveSync.downloadBook(book.id);
              const proc = new EpubProcessorWrapper();
              await proc.loadBook(await blob.arrayBuffer());
              const cover = await proc.getCoverBlob();
              if (cover) {
                injectCover(cover);
                item.removeChild(placeholder);
              }
            } catch (e) {
              console.warn('Failed to fetch remote cover for', book.id, e);
            }
          })();
        }
      }

      /* ─ Title ─ */
      const titleEl = document.createElement('p');
      titleEl.className = 'book-item-title';
      titleEl.textContent = book.title || 'Untitled Book';
      item.appendChild(titleEl);

      /* ─ Delete button ─ */
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '&#10005;';
      deleteBtn.title = `Delete "${book.title}"`;
      deleteBtn.setAttribute('aria-label', `Delete ${book.title || 'Untitled Book'}`);
      deleteBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return;
        try {
          if (book.isRemoteOnly && driveSync?.isConnected?.()) {
            await driveSync.deleteRemoteBook(book.id);
          } else {
            await deleteBook(book.id);
          }
          renderBookshelf(driveSync);
        } catch (err) {
          console.error(`${logPrefix} Error deleting book:`, err);
          alert(`Failed to delete book: ${err.message || 'Unknown error'}`);
        }
      };
      item.appendChild(deleteBtn);

      /* ─ Change‑cover button + hidden input ─ */
      const coverBtn = document.createElement('button');
      coverBtn.className = 'btn-change-cover action-btn';
      coverBtn.textContent = '📷';
      coverBtn.title = `Change cover for "${book.title}"`;
      coverBtn.setAttribute('aria-label', coverBtn.title);

      const coverInput = document.createElement('input');
      coverInput.type = 'file';
      coverInput.accept = 'image/*';
      coverInput.style.display = 'none';

      coverInput.onchange = async () => {
        if (!coverInput.files?.[0]) return;
        try {
          await updateBookCover(book.id, coverInput.files[0]);
          renderBookshelf(driveSync);
        } catch (err) {
          console.error(`${logPrefix} Failed to update cover for ${book.id}`, err);
        }
      };

      coverBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        coverInput.click();
      };

      item.appendChild(coverBtn);
      item.appendChild(coverInput);

      /* ─ Remote‑only: save‑offline + custom click ─ */
      if (book.isRemoteOnly) {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-save-offline action-btn';
        saveBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" style="display:block;margin:auto;">
            <path d="M5 20h14v-2H5v2zm7-18l-7 7h4v4h6v-4h4l-7-7z" />
          </svg>`;
        saveBtn.title = `Save "${book.title}" offline`;
        saveBtn.setAttribute('aria-label', saveBtn.title);

        saveBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            const blob = await driveSync.downloadBook(book.id);
            await addBook(book.title, blob, book.id);
            renderBookshelf(driveSync);
          } catch (err) {
            console.error(`${logPrefix} Save offline failed:`, err);
            alert('Failed to save book offline');
          }
        };
        item.appendChild(saveBtn);

        // Override default link behaviour: download then open at last position
        bookLink.onclick = async (ev) => {
          ev.preventDefault();
          try {
            const blob = await driveSync.downloadBook(book.id);
            await addBook(book.title, blob, book.id);
            await openBookAtProgress(book.id, book.title);
          } catch (err) {
            console.error(`${logPrefix} Failed to load remote book`, err);
            alert('Failed to load book from Drive');
          }
        };
      } else {
        // Local (or synced) book: open at last position
        bookLink.onclick = async (ev) => {
          ev.preventDefault();
          await openBookAtProgress(book.id, book.title);
        };
      }

      /* ─ Local‑only: upload to Drive ─ */
      if (driveSync?.isConnected?.() && !book.isRemoteOnly && !book.driveId) {
        const uploadBtn = document.createElement('button');
        uploadBtn.className = 'btn-upload-drive action-btn';
        uploadBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" style="display:block;margin:auto;">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
          </svg>`;
        uploadBtn.title = `Upload "${book.title}" to Google Drive`;
        uploadBtn.setAttribute('aria-label', uploadBtn.title);

        uploadBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            await driveSync.uploadBook(book.id);
            renderBookshelf(driveSync);
          } catch (err) {
            console.error(`${logPrefix} Upload to Drive failed:`, err);
            alert('Failed to upload to Google Drive');
          }
        };
        item.appendChild(uploadBtn);
      }

      // Assemble
      bookLink.appendChild(item);
      recentBooksGrid.appendChild(bookLink);
    });
  } catch (error) {
    console.error(`${logPrefix} Error rendering bookshelf:`, error);
    recentBooksGrid.innerHTML = `<p>Error loading bookshelf: ${error.message || 'Unknown error'}. Check console.</p>`;
  }
}
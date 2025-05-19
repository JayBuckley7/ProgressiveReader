import { getAllBooksMetadata, deleteBook, addBook, updateBookCover, getBook } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';

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
          fileType: rb.fileType,
          mimeType: rb.mimeType
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
      if (book.isRemoteOnly) {
        item.classList.add('remote');
        const badge = document.createElement('span');
        badge.className = 'remote-indicator';
        badge.textContent = '☁';
        item.appendChild(badge);
      }
      item.setAttribute('role', 'listitem');

      /* — Cover image — */
      const coverWrapper = document.createElement("div");
      coverWrapper.className = "book-cover-wrapper";
      item.appendChild(coverWrapper);

      const injectCover = (blob) => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.alt = `Cover for ${book.title || 'Untitled Book'}`;
        img.loading = 'lazy';
        img.onload = img.onerror = () => URL.revokeObjectURL(img.src);
        coverWrapper.appendChild(img);
      };

      if (book.coverImageBlob instanceof Blob) {
        injectCover(book.coverImageBlob);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'no-cover';
        placeholder.setAttribute('role', 'img');
        placeholder.setAttribute('aria-label', 'Cover placeholder');
        placeholder.textContent = 'No Cover';
        coverWrapper.appendChild(placeholder);

        // Try fetching cover from Drive
        if (book.isRemoteOnly && driveSync?.isConnected?.()) {
          (async () => {
            try {
              const blob = await driveSync.downloadBook(book.id, book.mimeType);
              const proc = new EpubProcessorWrapper();
              await proc.loadBook(await blob.arrayBuffer());
              const cover = await proc.getCoverBlob();
              if (cover) {
                injectCover(cover);
                coverWrapper.removeChild(placeholder);
              }
            } catch (e) {
              console.warn('Failed to fetch remote cover for', book.id, e);
            }
          })();
        }
      }

      /* ─ Title ─ */
      const titleEl = document.createElement('label');
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
                if (driveSync?.isConnected?.() && book.driveId) {
                    await driveSync.deleteRemoteBook(book.driveId);
                }
                if (!book.isRemoteOnly) {
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
      const coverInput = document.createElement('input');
      coverInput.type = 'file';
      coverInput.accept = 'image/*';
      coverInput.style.display = 'none';
      const coverInputId = `cover-file-${book.id}`;
      coverInput.id = coverInputId;

      const coverBtn = document.createElement('button');
      coverBtn.type = 'button';
      coverBtn.className = 'btn-change-cover action-btn';
      coverBtn.textContent = '📷';
      coverBtn.title = `Change cover for "${book.title}"`;
      coverBtn.setAttribute('aria-label', coverBtn.title);

      coverInput.onchange = async () => {
        if (!coverInput.files?.[0]) return;
        try {
          await updateBookCover(book.id, coverInput.files[0]);
          if (driveSync?.isConnected?.()) {
            try {
              await driveSync.uploadCoverToDrive(book.id, book.title, coverInput.files[0]);
            } catch (e) {
              console.warn(`${logPrefix} Failed to upload cover to Drive for ${book.id}`, e);
            }
          }
          renderBookshelf(driveSync);
        } catch (err) {
          console.error(`${logPrefix} Failed to update cover for ${book.id}`, err);
        }
      };

      coverBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Manually trigger file input since preventDefault() cancels label behavior
        coverInput.click();
      };

      coverWrapper.appendChild(coverBtn);
      item.appendChild(coverInput);

      /* ─ Remote‑only handling ─ */
      if (book.isRemoteOnly) {
        // Auto-download handled by driveSync; no re-render here

        bookLink.onclick = async (ev) => {
          ev.preventDefault();
          try {
            let blob = null;
            if (driveSync?.isConnected?.()) {
              blob = await driveSync.downloadBook(book.id, book.mimeType);
              await addBook(book.title, blob, book.id, { fileType: book.fileType });
            }
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

      // ─ Long‑press on mobile to show action buttons ─
      (() => {
        let longPressTimer = null;
        let longPressTriggered = false;
        const LONG_PRESS_MS = 500;

        const startPress = (ev) => {
          if (ev.type === 'mousedown' && ev.button !== 0) return;
          longPressTriggered = false;
          clearTimeout(longPressTimer);
          longPressTimer = setTimeout(() => {
            item.classList.add('touch-hover');
            longPressTriggered = true;
          }, LONG_PRESS_MS);
        };

        const cancelPress = (ev) => {
          clearTimeout(longPressTimer);
          if (longPressTriggered) {
            ev.preventDefault();
            ev.stopPropagation();
          }
        };

        const endPress = (ev) => {
          clearTimeout(longPressTimer);
          if (longPressTriggered) {
            ev.preventDefault();
            ev.stopPropagation();
            // Hide after a short delay
            setTimeout(() => item.classList.remove('touch-hover'), 2500);
          }
        };

        bookLink.addEventListener('touchstart', startPress);
        bookLink.addEventListener('mousedown', startPress);
        bookLink.addEventListener('touchend', endPress);
        bookLink.addEventListener('mouseup', endPress);
        bookLink.addEventListener('touchmove', cancelPress);
        bookLink.addEventListener('touchcancel', cancelPress);
        bookLink.addEventListener('mouseleave', cancelPress);
        bookLink.addEventListener('click', (e) => {
          if (longPressTriggered) {
            e.preventDefault();
            longPressTriggered = false;
          }
        }, true);
      })();

      // Assemble
      bookLink.appendChild(item);
      recentBooksGrid.appendChild(bookLink);
    });
  } catch (error) {
    console.error(`${logPrefix} Error rendering bookshelf:`, error);
    recentBooksGrid.innerHTML = `<p>Error loading bookshelf: ${error.message || 'Unknown error'}. Check console.</p>`;
  }
}

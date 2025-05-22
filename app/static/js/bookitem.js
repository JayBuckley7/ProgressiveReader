/**
 * Placeholder for book item component logic.
 * Future implementations may move DOM creation from bookshelfUI.js here.
 */
import { deleteBook, addBook, updateBookCover } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';

const logPrefix = "[BookItem]"; // Added for logging within bookitem

/**
 * Creates and returns a DOM element for a single book item.
 * @param {object} book - The book metadata object.
 * @param {object} driveSync - Optional Google Drive sync helper.
 * @param {function} renderBookshelf - Function to re-render the bookshelf.
 * @param {function} openBookAtProgress - Function to open a book.
 * @returns {HTMLElement} The created book link element.
 */
export function createBookItem(book, driveSync, renderBookshelf, openBookAtProgress) {
  // Wrapper link
  const bookLink = document.createElement('a');
  bookLink.href = '#'; // Navigation is handled by click handler
  bookLink.className = 'book-item-link';
  bookLink.setAttribute('aria-label', `Read ${book.title || 'Untitled Book'}`);

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
    img.alt = `Cover for ${book.title || 'Untitled Book'}`;
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
    placeholder.textContent = 'No Cover';
    coverWrapper.appendChild(placeholder);

    // Try fetching cover from Drive
    if (book.isRemoteOnly && driveSync?.isConnected?.()) {
      console.log(`${logPrefix} Grabbing cover for ${book.title} from Google Drive`);
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
          console.warn(`${logPrefix} Failed to fetch remote cover for ${book.id}`, e);
        }
      })();
    }
  }

  /* ─ Title ─ */
  const titleEl = document.createElement('label');
  titleEl.className = 'book-item-title';
  titleEl.textContent = book.title || 'Untitled Book';
  item.appendChild(titleEl);

  /* ─ Delete button ─ */
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.innerHTML = '&#10005;';
  deleteBtn.title = `Delete \"${book.title}\"`;
  deleteBtn.setAttribute('aria-label', `Delete ${book.title || 'Untitled Book'}`);
  deleteBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete \"${book.title}\"? This cannot be undone.`)) return;
    try {
      await deleteBook(book.id, book.driveId, driveSync);
      renderBookshelf(driveSync); // Re-render the bookshelf
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

  coverInput.addEventListener('click', function(e) {
    e.stopPropagation();
    // DO NOT preventDefault() here, it would stop the dialog.
  });

  const coverBtn = document.createElement('button');
  coverBtn.type = 'button';
  coverBtn.className = 'btn-change-cover action-btn';
  coverBtn.textContent = '📷';
  coverBtn.title = `Change cover for \"${book.title}\"`;
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
      renderBookshelf(driveSync); // Re-render the bookshelf
    } catch (err) {
      console.error(`${logPrefix} Failed to update cover for ${book.id}`, err);
    }
  };

  coverBtn.addEventListener('click', function(e) { // LOG MODIFICATION: Used addEventListener
    e.preventDefault();
    e.stopImmediatePropagation();
    if (coverInput) {
        coverInput.click();
    } else {
        console.error(`${logPrefix} coverBtn: coverInput is null or undefined!`);
    }
  });

  coverWrapper.appendChild(coverBtn);
  coverWrapper.appendChild(coverInput); // Changed from item.appendChild(coverInput)

  /* ─ Remote‑only handling ─ */
  // Helper to wrap original handlers with logging
  const createLoggedClickHandler = (type, originalHandler) => {
    return async (ev) => {
        if (ev.target.classList.contains('btn-change-cover') || ev.target.closest('.btn-change-cover')) {
            console.warn(`${logPrefix} bookLink: ${type} click handler triggered by click on or inside btn-change-cover! Propagation should have been stopped.`);
        }
        // Call original handler logic based on type
        if (type === 'REMOTE') {
            ev.preventDefault();
            try {
                let blob = null;
                if (driveSync?.isConnected?.()) {
                    console.log(`${logPrefix} Grabbing ${book.title} from Google Drive`);
                    blob = await driveSync.downloadBook(book.id, book.mimeType);
                    await addBook(book.title, blob, book.id, { fileType: book.fileType });
                }
                await openBookAtProgress(book.id, book.title);
            } catch (err) {
                console.error(`${logPrefix} Failed to load remote book`, err);
                alert('Failed to load book from Drive');
            }
        } else if (type === 'LOCAL') {
            ev.preventDefault();
            await openBookAtProgress(book.id, book.title);
        } else {
            // Fallback to originalHandler if provided and type doesn't match
             if (originalHandler) await originalHandler(ev);
        }
    };
  };

  if (book.isRemoteOnly) {
    bookLink.onclick = createLoggedClickHandler('REMOTE', async (ev_unused) => {});
  } else {
    bookLink.onclick = createLoggedClickHandler('LOCAL', async (ev_unused) => {});
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

    // Capture phase click listener for bookLink (related to long-press and general capture)
    bookLink.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-change-cover') || e.target.closest('.btn-change-cover')) {
            // Explicitly not stopping propagation here for btn-change-cover,
            // as its own handler should manage it.
        }
        if (longPressTriggered) {
            e.preventDefault();
            e.stopImmediatePropagation();
            longPressTriggered = false; // Resetting the flag
        }
    }, true); // Capture phase
  })();

  // Assemble
  bookLink.appendChild(item);
  return bookLink;
}

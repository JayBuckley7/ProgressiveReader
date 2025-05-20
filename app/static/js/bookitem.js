import { deleteBook, addBook, updateBookCover } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';

/**
 * Create the DOM structure for a single book item.
 *
 * @param {object} book - Metadata for the book.
 * @param {object} driveSync - Optional Drive sync helper.
 * @param {Function} openBook - Callback used to open the book.
 * @param {Function} rerender - Callback to refresh the bookshelf.
 * @returns {HTMLElement} Anchor element wrapping the item.
 */
export function createBookItem(book, driveSync, openBook, rerender) {
    const bookLink = document.createElement('a');
    bookLink.href = '#';
    bookLink.className = 'book-item-link';
    bookLink.setAttribute('aria-label', `Read ${book.title || 'Untitled\u00A0Book'}`);

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

    /* ─ Cover image ─ */
    const coverWrapper = document.createElement('div');
    coverWrapper.className = 'book-cover-wrapper';
    item.appendChild(coverWrapper);

    const injectCover = (blob) => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        img.alt = `Cover for ${book.title || 'Untitled\u00A0Book'}`;
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
        placeholder.textContent = 'No\u00A0Cover';
        coverWrapper.appendChild(placeholder);

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

    /* ─ Change-cover button ─ */
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
                    console.warn(`Failed to upload cover to Drive for ${book.id}`, e);
                }
            }
            rerender?.(driveSync);
        } catch (err) {
            console.error(`Failed to update cover for ${book.id}`, err);
        }
    };

    coverBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        coverInput.click();
    };

    coverWrapper.appendChild(coverBtn);
    item.appendChild(coverInput);

    /* ─ Title ─ */
    const titleEl = document.createElement('label');
    titleEl.className = 'book-item-title';
    titleEl.textContent = book.title || 'Untitled\u00A0Book';
    item.appendChild(titleEl);

    /* ─ Delete button ─ */
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '&#10005;';
    deleteBtn.title = `Delete "${book.title}"`;
    deleteBtn.setAttribute('aria-label', `Delete ${book.title || 'Untitled\u00A0Book'}`);
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
            rerender?.(driveSync);
        } catch (err) {
            console.error('[BookItem] Error deleting book:', err);
            alert(`Failed to delete book: ${err.message || 'Unknown error'}`);
        }
    };
    item.appendChild(deleteBtn);

    /* ─ Remote-only handling ─ */
    if (book.isRemoteOnly) {
        bookLink.onclick = async (ev) => {
            ev.preventDefault();
            try {
                let blob = null;
                if (driveSync?.isConnected?.()) {
                    blob = await driveSync.downloadBook(book.id, book.mimeType);
                    await addBook(book.title, blob, book.id, { fileType: book.fileType });
                }
                await openBook(book.id, book.title);
            } catch (err) {
                console.error('Failed to load remote book', err);
                alert('Failed to load book from Drive');
            }
        };
    } else {
        bookLink.onclick = async (ev) => {
            ev.preventDefault();
            await openBook(book.id, book.title);
        };
    }

    /* ─ Long-press on mobile to show action buttons ─ */
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
        bookLink.addEventListener(
            'click',
            (e) => {
                if (longPressTriggered) {
                    e.preventDefault();
                    longPressTriggered = false;
                }
            },
            true,
        );
    })();

    bookLink.appendChild(item);
    return bookLink;
}


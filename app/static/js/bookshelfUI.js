import { getAllBooksMetadata, deleteBook, addBook, updateBookCover } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';

const recentBooksGrid = document.getElementById("recent-books-grid");

// Standardize log prefix
const logPrefix = "[BookshelfUI]";

/**
 * Renders the list of books from IndexedDB onto the bookshelf grid.
 * @param {object} driveSync - The driveSync module for checking connection status.
 */
export async function renderBookshelf(driveSync, searchQuery = "") {
  if (!recentBooksGrid) {
    console.error(`${logPrefix} Bookshelf grid element not found.`);
    return;
  }

  // Check if we're in demo mode
  const isInDemoMode = window.IS_DEMO_MODE === true;
  console.log(`${logPrefix} Demo mode detected: ${isInDemoMode}`);

  console.log(`${logPrefix} Starting render...`);
  recentBooksGrid.innerHTML = "<p>Loading bookshelf...</p>";
  recentBooksGrid.setAttribute("role", "list");
  recentBooksGrid.setAttribute("aria-live", "polite");

  try {
    console.log(`${logPrefix} Calling getAllBooksMetadata...`);
    const booksMetadata = await getAllBooksMetadata();

    // ───────────────────────────────────────────────
    // 1) Merge remote Drive metadata (if connected)
    // ───────────────────────────────────────────────
    let remoteBooks = [];
    if (driveSync?.isConnected?.()) {
      try {
        remoteBooks = await driveSync.listRemoteBooks();
      } catch (err) {
        console.warn(`${logPrefix} Failed to list remote books:`, err);
      }
    }

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

    // Filter out demo books (unless demo mode)
    let filteredBooksMetadata = isInDemoMode
      ? booksMetadata
      : booksMetadata.filter((book) => !book.isDemo);

    // Apply text search
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      filteredBooksMetadata = filteredBooksMetadata.filter((book) =>
        (book.title || "").toLowerCase().includes(search),
      );
    }

    recentBooksGrid.innerHTML = ""; // Clear loading state

    if (filteredBooksMetadata.length === 0) {
      recentBooksGrid.innerHTML =
        "<p>Your bookshelf is empty. Upload an EPUB to get started!</p>";
      return;
    }

    // Sort books by lastOpened (desc), then title (asc)
    filteredBooksMetadata.sort((a, b) => {
      const dateA = a.lastOpened ? new Date(a.lastOpened) : new Date(0);
      const dateB = b.lastOpened ? new Date(b.lastOpened) : new Date(0);
      if (dateB - dateA !== 0) return dateB - dateA;
      return a.title.localeCompare(b.title);
    });

    // ───────────────────────────────────────────────
    // 2) Render each book item
    // ───────────────────────────────────────────────
    filteredBooksMetadata.forEach((book) => {
      // ── Build link with reading‑progress support ─────────────────────
      const bookLink = document.createElement("a");
      let startIndex = 0;
      if (
        window.storageManager &&
        typeof window.storageManager.getReadingProgress === "function"
      ) {
        const saved = window.storageManager.getReadingProgress(book.id);
        if (saved !== null) startIndex = saved;
      }
      bookLink.href = book.isRemoteOnly
        ? "#"
        : `/read/${book.id}/${startIndex}`;
      bookLink.className = "book-item-link";
      bookLink.setAttribute(
        "aria-label",
        `Read ${book.title || "Untitled Book"}`,
      );

      // ── Container div ────────────────────────────────────────────────
      const bookItemDiv = document.createElement("div");
      bookItemDiv.className = "book-item";
      bookItemDiv.dataset.bookId = book.id;
      if (book.isRemoteOnly) bookItemDiv.classList.add("remote");
      bookItemDiv.setAttribute("role", "listitem");

      // ── Cover (local Blob → img, otherwise placeholder) ──────────────
      if (book.coverImageBlob instanceof Blob) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(book.coverImageBlob);
        img.alt = `Cover for ${book.title || "Untitled Book"}`;
        img.loading = "lazy";
        img.onload = img.onerror = () => URL.revokeObjectURL(img.src);
        bookItemDiv.appendChild(img);
      } else {
        const noCoverDiv = document.createElement("div");
        noCoverDiv.className = "no-cover";
        noCoverDiv.setAttribute("role", "img");
        noCoverDiv.setAttribute("aria-label", "Cover placeholder");
        noCoverDiv.textContent = "No Cover";
        bookItemDiv.appendChild(noCoverDiv);

        // Try to fetch Drive cover on‑the‑fly
        if (book.isRemoteOnly && driveSync?.isConnected?.()) {
          (async () => {
            try {
              const blob = await driveSync.downloadBook(book.id);
              const proc = new EpubProcessorWrapper();
              await proc.loadBook(await blob.arrayBuffer());
              const cover = await proc.getCoverBlob();
              if (cover) {
                const img = document.createElement("img");
                img.src = URL.createObjectURL(cover);
                img.alt = `Cover for ${book.title}`;
                img.loading = "lazy";
                img.onload = () => URL.revokeObjectURL(img.src);
                bookItemDiv.replaceChild(img, noCoverDiv);
              }
            } catch (e) {
              console.warn("Failed to fetch remote cover for", book.id, e);
            }
          })();
        }
      }

      // ── Title ────────────────────────────────────────────────────────
      const titleElement = document.createElement("p");
      titleElement.className = "book-item-title";
      titleElement.textContent = book.title || "Untitled Book";
      bookItemDiv.appendChild(titleElement);

      // ── Delete button ────────────────────────────────────────────────
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.innerHTML = "&#10005;";
      deleteBtn.setAttribute(
        "aria-label",
        `Delete ${book.title || "Untitled Book"}`,
      );
      deleteBtn.title = `Delete "${book.title}"`;
      deleteBtn.dataset.bookId = book.id;
      deleteBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (
          confirm(
            `Are you sure you want to delete "${book.title}"? This cannot be undone.`,
          )
        ) {
          try {
            if (book.isRemoteOnly && driveSync?.isConnected?.()) {
              await driveSync.deleteRemoteBook(book.id);
              console.log(
                `${logPrefix} Remote book ${book.id} deleted from Drive.`,
              );
            } else {
              await deleteBook(book.id);
              console.log(`${logPrefix} Book ${book.id} deleted from DB.`);
            }
            renderBookshelf(driveSync);
          } catch (err) {
            console.error(`${logPrefix} Error deleting book:`, err);
            alert(`Failed to delete book: ${err.message || "Unknown error"}`);
          }
        }
      };
      bookItemDiv.appendChild(deleteBtn);

      // ── Custom cover change button ─────────────────────────────────--
      const coverBtn = document.createElement("button");
      coverBtn.className = "btn-change-cover action-btn";
      coverBtn.textContent = "📷";
      coverBtn.title = `Change cover for "${book.title}"`;
      coverBtn.setAttribute(
        "aria-label",
        `Change cover for ${book.title || "Untitled Book"}`,
      );

      const coverInput = document.createElement("input");
      coverInput.type = "file";
      coverInput.accept = "image/*";
      coverInput.style.display = "none";

      coverInput.addEventListener("change", async () => {
        if (coverInput.files?.[0]) {
          try {
            await updateBookCover(book.id, coverInput.files[0]);
            await renderBookshelf(driveSync);
          } catch (err) {
            console.error(
              `${logPrefix} Failed to update cover for ${book.id}`,
              err,
            );
          }
        }
      });

      coverBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        coverInput.click();
      });

      bookItemDiv.appendChild(coverBtn);
      bookItemDiv.appendChild(coverInput);

      // ── Save‑offline button (remote-only) ────────────────────────────
      if (book.isRemoteOnly) {
        const saveBtn = document.createElement("button");
        saveBtn.className = "btn-save-offline action-btn";
        saveBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="current

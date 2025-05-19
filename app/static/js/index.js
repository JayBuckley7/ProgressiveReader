import { ready as dbReady, getBook } from "./dbService.js";
import { renderBookshelf } from "./bookshelfUI.js";
import { setupUploadForm } from "./uploadHandler.js";
import * as driveSync from "./driveSync.js";
import { DriveButton } from "./driveButton.js"; // Import the new component
import './storageManager.js'; // Ensure storageManager is loaded and sets window.storageManager

// Standardize log prefix
const logPrefix = "[IndexInit]";

/**
 * Initializes the application logic after the DOM is ready and DB service is available.
 */
async function initializeApp() {
  console.log(`${logPrefix} DOM Content Loaded. Waiting for DB service...`);
  // Log availability of window.dbKeyVal before dbReady
  console.log(
    `${logPrefix} Initial check: window.dbKeyVal available:`,
    !!window.dbKeyVal,
    "window.dbKeyVal type:",
    typeof window.dbKeyVal,
  );

  const recentBooksGrid = document.getElementById("recent-books-grid");
  const searchInput = document.getElementById("bookshelf-search");
  let currentSearchQuery = searchInput ? searchInput.value : "";
  // Get the container for all drive controls
  const driveControlsContainer = document.getElementById(
    "drive-controls-container",
  );

  // const syncBtn = document.getElementById('btn-sync'); // Now managed by DriveButton
  // const driveLink = document.getElementById('btn-drive'); // Now managed by DriveButton

  try {
    await dbReady;
    console.log(`${logPrefix} DB service is ready.`);
    // Log availability of window.dbKeyVal after dbReady
    console.log(
      `${logPrefix} After dbReady: window.dbKeyVal available:`,
      !!window.dbKeyVal,
      "window.dbKeyVal type:",
      typeof window.dbKeyVal,
    );

    renderBookshelf(driveSync, currentSearchQuery);
    setupUploadForm();

    let driveButton = null;
    if (driveControlsContainer) {
      // Pass the container to DriveButton
      driveButton = new DriveButton(driveControlsContainer, driveSync);
    } else {
      console.warn(
        `${logPrefix} Drive controls container (#drive-controls-container) not found. DriveButton not initialized.`,
      );
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        currentSearchQuery = searchInput.value;
        renderBookshelf(driveSync, currentSearchQuery);
      });
    }

    // Event listener for "Upload to Drive" buttons on book cards
    if (recentBooksGrid) {
      recentBooksGrid.addEventListener("click", async (event) => {
        const uploadButton = event.target.closest(".btn-upload-drive");
        if (uploadButton) {
          event.preventDefault();
          event.stopPropagation();

          const bookId = uploadButton.dataset.bookId;
          const bookTitle = uploadButton.dataset.bookTitle;

          if (!bookId || !bookTitle) {
            console.error(
              `${logPrefix} Book ID or Title missing from upload button.`,
            );
            alert("Could not initiate upload: Book ID or Title missing.");
            return;
          }

          console.log(
            `${logPrefix} Upload to Drive clicked for book ID: ${bookId}, Title: ${bookTitle}`,
          );

          const originalButtonContent = uploadButton.innerHTML; // Store original content
          uploadButton.disabled = true;
          uploadButton.innerHTML = "Preparing..."; // Initial feedback

          try {
            const bookData = await getBook(bookId);
            if (!bookData || !bookData.content) {
              console.error(
                `${logPrefix} EPUB data (bookData.content) not found for book ${bookId}. BookData received:`,
                bookData,
              );
              alert("Could not retrieve EPUB data to upload.");
              uploadButton.disabled = false;
              uploadButton.innerHTML = originalButtonContent; // Restore
              return;
            }

            console.log(
              `${logPrefix} Calling driveSync.uploadBookToDrive with:`,
              { bookId, bookTitle, epubBlob: bookData.content },
            );

            uploadButton.innerHTML = "Uploading...";

            // Actual call to driveSync.uploadBookToDrive
            const uploadedFile = await driveSync.uploadBookToDrive(
              bookId,
              bookTitle,
              bookData.content,
            );

            console.log(
              `[IndexInit] Upload successful for "${bookTitle}". Drive file ID: ${uploadedFile.id}`,
            );
            alert(`"${bookTitle}" uploaded to Google Drive successfully!`);

            uploadButton.innerHTML = "Uploaded!"; // Feedback for success
            // Consider disabling permanently or changing icon if already uploaded and no re-upload desired
            // For now, re-enable after a delay to allow another potential upload if needed (or for testing)
            setTimeout(() => {
              uploadButton.disabled = false;
              uploadButton.innerHTML = originalButtonContent;
            }, 3000);
          } catch (error) {
            console.error(
              `${logPrefix} Error during upload process for book ${bookId}:`,
              error,
            );
            alert(
              `Failed to upload "${bookTitle}": ${error.message || "Unknown error"}`,
            );
            uploadButton.disabled = false;
            uploadButton.innerHTML = originalButtonContent; // Restore on error
          }
        }
      });
    }

    const banner = document.getElementById("drive-status");
    function showBanner(text, cls, hideAfterMs = 0) {
      if (!banner) return;
      banner.textContent = text;
      banner.className = cls;
      banner.style.display = "block";
      banner.hidden = false;
      if (hideAfterMs) {
        setTimeout(() => {
          banner.style.display = "none";
          banner.hidden = true;
        }, hideAfterMs);
      }
    }
    window.addEventListener("drive-sync-start", () => {
      showBanner("Syncing…", "syncing");
      driveButton?.setState("connecting");
    });
    window.addEventListener("drive-sync-complete", () => {
      showBanner("Up to date", "idle", 4000);
      renderBookshelf(driveSync, currentSearchQuery);
      driveButton?.refreshState();
    });
    window.addEventListener("drive-offline", () =>
      showBanner("Offline", "offline"),
    );
    window.addEventListener("drive-online", () => {
      showBanner("Online", "idle", 2000);
      driveButton?.refreshState(); // Refresh button state when coming online
    });
    window.addEventListener("drive-disconnect", () => {
      if (banner) {
        banner.style.display = "none";
        banner.hidden = true;
      }
      driveButton?.refreshState();
    });

    try {
      console.log(`${logPrefix} Attempting early driveSync.init()...`);
      await driveSync.init();
      driveButton?.refreshState();

      if (driveSync.isConnected()) {
        console.log(
          `${logPrefix} Early driveSync.init() successful, Drive is connected.`,
        );
      } else {
        console.log(
          `${logPrefix} Early driveSync.init() completed, but Drive is not connected.`,
        );
      }
    } catch (err) {
      console.warn(
        `${logPrefix} Early driveSync.init() failed or token absent:`,
        err.message,
      );
      driveButton?.refreshState();
    }

    if (driveSync && typeof driveSync.onAuthLost === "function") {
      driveSync.onAuthLost(() => {
        console.warn(
          `${logPrefix} Auth lost callback triggered. Resetting UI.`,
        );
        driveButton?.refreshState();
        alert("Google Drive connection lost. Please connect again.");
      });
    }

    console.log(`${logPrefix} Application initialization complete.`);
  } catch (err) {
    console.error(`${logPrefix} Error during application initialization:`, err);
    if (recentBooksGrid) {
      recentBooksGrid.innerHTML =
        "<p>Error initializing application. Cannot load bookshelf.</p>";
    } else {
      alert("Critical error initializing application components.");
    }
    driveButton?.refreshState();
    const uploadButton = document.querySelector("#upload-form button"); // Note: this is the main upload button, not the card one
    if (uploadButton) {
      uploadButton.disabled = true;
      uploadButton.textContent = "Error Initializing";
    }
  }
}

// --- Execution Start ---
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

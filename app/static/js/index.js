import { ready as dbReady, getBook } from "./dbService.js";
import { renderBookshelf } from "./bookshelfUI.js";
import { setupUploadForm } from "./uploadHandler.js";
import driveService from "./driveService.js";
window.driveService = driveService;
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

    renderBookshelf(driveService, currentSearchQuery);
    setupUploadForm();

    let driveButton = null;
    if (driveControlsContainer) {
      // Pass the container to DriveButton
      driveButton = new DriveButton(driveControlsContainer, driveService);
    } else {
      console.warn(
        `${logPrefix} Drive controls container (#drive-controls-container) not found. DriveButton not initialized.`,
      );
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        currentSearchQuery = searchInput.value;
        renderBookshelf(driveService, currentSearchQuery);
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
              `${logPrefix} Calling driveService.uploadBookToDrive with:`,
              { bookId, bookTitle, epubBlob: bookData.content },
            );

            uploadButton.innerHTML = "Uploading...";

            // Actual call to driveService.uploadBookToDrive
            const uploadedFile = await driveService.uploadBookToDrive(
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
    const driveIndicator = document.getElementById("drive-indicator");
    const driveUser = document.getElementById("drive-user");

    function updateIndicator(isOn) {
      if (!driveIndicator) return;
      driveIndicator.className = `drive-indicator ${isOn ? "connected" : "disconnected"}`;
      driveIndicator.setAttribute(
        "aria-label",
        isOn ? "Drive connected" : "Drive disconnected",
      );
      if (driveUser) {
        const profile = driveService.getUserProfile();
        driveUser.textContent = isOn && profile ? `(${profile.name})` : "";
      }
    }

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
    window.addEventListener("drive-sync-start", () =>
      showBanner("Syncing…", "syncing"),
    );
    window.addEventListener("drive-sync-complete", () => {
      showBanner("Up to date", "idle", 4000);
      renderBookshelf(driveService, currentSearchQuery);
    });
    window.addEventListener("drive-offline", () => {
      showBanner("Offline", "offline");
      updateIndicator(false);
    });
    window.addEventListener("drive-online", () => {
      showBanner("Online", "idle", 2000);
      updateIndicator(true);
      driveButton?.refreshState(); // Refresh button state when coming online
    });
    window.addEventListener("drive-disconnect", () => {
      if (banner) {
        banner.style.display = "none";
        banner.hidden = true;
      }
      updateIndicator(false);
      driveButton?.refreshState();
    });

    try {
      console.log(`${logPrefix} Attempting early driveService.init()...`);
      await driveService.init();
      driveButton?.refreshState();
      updateIndicator(driveService.isConnected());

      if (driveService.isConnected()) {
        console.log(
          `${logPrefix} Early driveService.init() successful, Drive is connected.`,
        );
      } else {
        console.log(
          `${logPrefix} Early driveService.init() completed, but Drive is not connected.`,
        );
      }
    } catch (err) {
      console.warn(
        `${logPrefix} Early driveService.init() failed or token absent:`,
        err.message,
      );
      driveButton?.refreshState();
      updateIndicator(false);
    }

    if (driveService && typeof driveService.onAuthLost === "function") {
      driveService.onAuthLost(() => {
        console.warn(
          `${logPrefix} Auth lost callback triggered. Resetting UI.`,
        );
        driveButton?.refreshState();
        updateIndicator(false);
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
    updateIndicator(false);
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

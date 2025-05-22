import { ready as dbReady, getBook } from "./dbService.js";
import { renderBookshelf } from "./bookshelf.js";
import { setupUploadForm } from "./uploadHandler.js";
import * as driveSync from "./driveSync.js";
window.driveSync = driveSync;
import { DriveButton } from "./driveButton.js"; // Import the new component
import './storageManager.js'; // Ensure storageManager is loaded and sets window.storageManager

// Standardize log prefix
const logPrefix = "[IndexInit]";

/**
 * Initializes the application logic after the DOM is ready and DB service is available.
 */
async function initializeApp() {
//   console.log(`${logPrefix} DOM Content Loaded. Waiting for DB service...`);
  // Log availability of window.dbKeyVal before dbReady
//   console.log(
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
  const driveLinkHeader = document.getElementById('btn-drive');
  const banner = document.getElementById("drive-status");
  const driveIndicator = document.getElementById("drive-indicator");

  // const syncBtn = document.getElementById('btn-sync'); // Now managed by DriveButton
  // const driveLink = document.getElementById('btn-drive'); // Now managed by DriveButton

  try {
    await dbReady;
//     console.log(`${logPrefix} DB service is ready.`);
    // Log availability of window.dbKeyVal after dbReady
//     console.log(
      `${logPrefix} After dbReady: window.dbKeyVal available:`,
      !!window.dbKeyVal,
      "window.dbKeyVal type:",
      typeof window.dbKeyVal,
    );

    let driveButton = null;
    if (driveControlsContainer) {
      driveButton = new DriveButton(driveControlsContainer, driveSync);
    } else {
      console.warn(
        `${logPrefix} Drive controls container (#drive-controls-container) not found. DriveButton not initialized.`,
      );
    }

    await driveSync.init();
    driveButton?.refreshState(); // Initialize button state based on sync status
    updateIndicator(driveSync.isConnected()); // Initial indicator state
    updateDriveLink(); // Initial drive link state

    renderBookshelf(driveSync, currentSearchQuery);
    setupUploadForm();

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        currentSearchQuery = searchInput.value;
        renderBookshelf(driveSync, currentSearchQuery);
      });
    }

    // Upload buttons removed – uploads happen automatically when connected

    function updateIndicator(isOn) {
      if (!driveIndicator) return;
      driveIndicator.className = `drive-indicator ${isOn ? "connected" : "disconnected"}`;
      driveIndicator.setAttribute(
        "aria-label",
        isOn ? "Drive connected" : "Drive disconnected",
      );
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
    window.addEventListener("drive-sync-start", () => {
      showBanner("Syncing…", "syncing");
      driveButton?.setState("connecting");
    });
    window.addEventListener("drive-sync-complete", (event) => {
      showBanner("Up to date", "idle", 4000);
      const { added = 0, updated = 0, removed = 0 } = event.detail || {};
      if (added || updated || removed) {
        renderBookshelf(driveSync, currentSearchQuery);
      }
      driveButton?.refreshState();
    });
    window.addEventListener("drive-offline", () => {
      showBanner("Offline", "offline");
      updateIndicator(false);
    });
    window.addEventListener("drive-online", () => {
      showBanner("Online", "idle", 2000);
      updateIndicator(true);
      driveButton?.refreshState(); // Refresh button state when coming online
      updateDriveLink();
    });
    window.addEventListener("drive-connected-loading", () => {
      showBanner("Connecting...", "syncing");
      if (driveIndicator) {
        driveIndicator.className = "drive-indicator connected-loading";
        driveIndicator.setAttribute("aria-label", "Drive connecting");
      }
      updateDriveLink();
    });
    window.addEventListener("drive-disconnect", () => {
      if (banner) {
        banner.style.display = "none";
        banner.hidden = true;
      }
      updateIndicator(false);
      driveButton?.refreshState();
      updateDriveLink();
    });

    // Helper to keep Drive folder link up-to-date
    function updateDriveLink() {
      if (!driveLinkHeader) return;
      if (driveSync.isConnected()) {
        const folderId = driveSync.getFolderId();
        if (folderId) {
          driveLinkHeader.href = `https://drive.google.com/drive/folders/${folderId}`;
          driveLinkHeader.style.display = 'inline-flex';
          return;
        }
      }
      // Not connected or no folder yet ⇒ hide link
      driveLinkHeader.style.display = 'none';
    }

    // Listen for auth-lost callback from driveSync module (if provided)
    if (driveSync && typeof driveSync.onAuthLost === 'function') {
      driveSync.onAuthLost(() => {
        console.warn(`${logPrefix} Auth lost callback triggered. Resetting UI.`);
        driveButton?.refreshState();
        updateIndicator(false);
        updateDriveLink();
        alert('Google Drive connection lost. Please connect again.');
      });
    }

//     console.log(`${logPrefix} Application initialization complete.`);

  } catch (err) {
    console.error(`${logPrefix} Error during application initialization:`, err);
  }
}

// --- Execution Start ---
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
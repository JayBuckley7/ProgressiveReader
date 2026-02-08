import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { OFFLINE_BOOKS_KEY } from "@features/books/utils/offlineLibrary";
import type { DrivePort } from "@core/drive/ports";
import type { DriveCachePort } from "@core/drive/cachePort";

export type ClerkClient = {
  loaded: boolean;
  redirectToSignIn: () => void;
  signOut: () => Promise<void>;
};

function clearReadingProgress() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("reading_progress_")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

function clearPersistedSettings() {
  document.cookie = "prSettings=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  localStorage.removeItem("prSettings");
  localStorage.removeItem("showPopupOnHover");
  localStorage.removeItem("touchscreenSupport");
  localStorage.removeItem("disableFadeAnimation");
}

export function signInWithClerk(clerk: ClerkClient) {
  if (!clerk.loaded) {
    notifyError("Authentication system not loaded yet");
    return;
  }
  clerk.redirectToSignIn();
}

export async function secureSignOut(params: {
  clerk: ClerkClient;
  onSignedOut: () => void;
  drive: DrivePort;
  driveCache: DriveCachePort;
}) {
  const { clerk, onSignedOut, drive, driveCache } = params;

  if (!clerk.loaded) {
    notifyError("Authentication system not loaded yet");
    return;
  }

  try {
    await clerk.signOut();
  } catch (error) {
    notifyError(error, { title: "Sign out failed" });
    return;
  }

  onSignedOut();

  // SECURITY: Clear Google Drive tokens when Clerk user signs out.
  drive.onClerkSignOut();

  // SECURITY: Explicitly wipe local data to prevent access by next user.
  localStorage.removeItem(OFFLINE_BOOKS_KEY);
  clearReadingProgress();

  try {
    await driveCache.clearAllCache();
    appLog.debug("[useStorageService] Secure logout: local cache wiped");
  } catch (e) {
    appLog.error("[useStorageService] Failed to wipe cache on logout", e);
  }

  clearPersistedSettings();
}

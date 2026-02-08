import type { MutableRefObject } from "react";

import { appLog } from "@shared/appLog";
import { toast } from "sonner";

import { notifyError } from "@shared/utils/notify";

import { bookMetadataService } from "@features/books/services/bookMetadata";

export type CloudSettings = Record<string, unknown>;

export async function saveCloudSettings(params: {
  clerkUserId: string | null;
  settings: CloudSettings;
}): Promise<boolean> {
  const { clerkUserId, settings } = params;
  if (!clerkUserId) {
    appLog.debug("[useStorageService] Cannot save settings: user not authenticated");
    return false;
  }

  try {
    const success = await bookMetadataService.saveSettings(settings);
    appLog.debug(`[useStorageService] Settings save result: ${success ? "ok" : "failed"}`);
    return success;
  } catch (error) {
    appLog.error("[useStorageService] Error saving settings", error);
    return false;
  }
}

function getErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  if (!("message" in err)) return undefined;
  return String((err as { message: unknown }).message);
}

export async function loadCloudSettings(params: {
  ensureAuthenticated: () => Promise<boolean>;
  onUnauthorized: () => void;
}): Promise<CloudSettings | null> {
  const { ensureAuthenticated, onUnauthorized } = params;

  const isAuthenticated = await ensureAuthenticated();
  if (!isAuthenticated) {
    appLog.debug("[useStorageService] Authentication failed, cannot load cloud settings");
    return null;
  }

  try {
    const settings = await bookMetadataService.loadSettings();
    return (settings && typeof settings === "object") ? (settings as CloudSettings) : null;
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === "UNAUTHORIZED") {
      onUnauthorized();
      throw error;
    }

    appLog.error("[useStorageService] Error loading settings", error);
    // Don't surface: fall back to defaults.
    return null;
  }
}

export function handleUnauthorizedCloudSettingsLoad(params: {
  sessionCooldownMs: number;
  lastSessionToastRef: MutableRefObject<number>;
  isDriveSyncingRef: MutableRefObject<boolean>;
}) {
  const { sessionCooldownMs, lastSessionToastRef, isDriveSyncingRef } = params;

  if (Date.now() - lastSessionToastRef.current <= sessionCooldownMs) return;

  if (isDriveSyncingRef.current) {
    toast.info("Drive syncing…");
  } else {
    notifyError("Session expired, please sign in again");
  }
  lastSessionToastRef.current = Date.now();
}

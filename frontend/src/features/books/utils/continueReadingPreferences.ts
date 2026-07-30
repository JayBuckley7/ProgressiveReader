import type { ReadingProgress } from "~/types";

const PREFERENCES_VERSION = 1;
const PREFERENCES_KEY_PREFIX = "progressive-reader:continue-reading:v1:";

export type ContinueReadingPreferences = {
  collapsed: boolean;
  dismissedProgressAt: Record<string, string>;
};

const DEFAULT_PREFERENCES: ContinueReadingPreferences = {
  collapsed: false,
  dismissedProgressAt: {},
};

function storageForBrowser(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function preferencesKey(userId: string): string {
  return `${PREFERENCES_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

export function readContinueReadingPreferences(
  userId: string,
  storage?: Storage
): ContinueReadingPreferences {
  const target = storageForBrowser(storage);
  if (!target) return { ...DEFAULT_PREFERENCES };

  const key = preferencesKey(userId);
  const raw = target.getItem(key);
  if (!raw) return { ...DEFAULT_PREFERENCES };

  try {
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      collapsed?: unknown;
      dismissedProgressAt?: unknown;
    };
    if (
      parsed.version !== PREFERENCES_VERSION ||
      typeof parsed.collapsed !== "boolean" ||
      !parsed.dismissedProgressAt ||
      typeof parsed.dismissedProgressAt !== "object" ||
      Array.isArray(parsed.dismissedProgressAt)
    ) {
      target.removeItem(key);
      return { ...DEFAULT_PREFERENCES };
    }

    const dismissedProgressAt = Object.fromEntries(
      Object.entries(parsed.dismissedProgressAt).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" &&
          typeof entry[1] === "string" &&
          Number.isFinite(Date.parse(entry[1]))
      )
    );

    return {
      collapsed: parsed.collapsed,
      dismissedProgressAt,
    };
  } catch {
    target.removeItem(key);
    return { ...DEFAULT_PREFERENCES };
  }
}

export function writeContinueReadingPreferences(
  userId: string,
  preferences: ContinueReadingPreferences,
  storage?: Storage
): void {
  const target = storageForBrowser(storage);
  if (!target) return;

  target.setItem(
    preferencesKey(userId),
    JSON.stringify({
      version: PREFERENCES_VERSION,
      ...preferences,
    })
  );
}

export function dismissContinueReadingProgress(
  preferences: ContinueReadingPreferences,
  progress: ReadingProgress
): ContinueReadingPreferences {
  return {
    ...preferences,
    dismissedProgressAt: {
      ...preferences.dismissedProgressAt,
      [progress.bookId]: new Date(progress.lastUpdated).toISOString(),
    },
  };
}

export function isContinueReadingProgressDismissed(
  preferences: ContinueReadingPreferences,
  progress: ReadingProgress
): boolean {
  const dismissedAt = preferences.dismissedProgressAt[progress.bookId];
  if (!dismissedAt) return false;
  return new Date(progress.lastUpdated).getTime() <= new Date(dismissedAt).getTime();
}

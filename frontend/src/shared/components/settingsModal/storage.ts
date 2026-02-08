import { appLog } from "@shared/appLog";
import { DEPRECATED_STORAGE_KEYS, localKeys } from "./constants";
import type { LocalSettingsState } from "./types";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function readString(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback;
}

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

export function readLocalSettingsState(): LocalSettingsState {
  return {
    openaiKey: readString(localKeys.openaiKey, ""),
    openaiModel: readString(localKeys.openaiModel, DEFAULT_OPENAI_MODEL),
    cefrLevel: readNumber(localKeys.cefrLevel, 3),
    autoload: readBoolean(localKeys.autoload, false),
    jpdbDeckId: readString(localKeys.jpdbDeckId, ""),
    forqDeckId: readString(localKeys.forqDeckId, ""),
    blacklistDeckId: readString(localKeys.blacklistDeckId, ""),
    neverForgetDeckId: readString(localKeys.neverForgetDeckId, ""),
    contextSentenceCount: Math.max(1, readNumber(localKeys.contextSentenceCount, 1)),
    autoAddToFORQ: readBoolean(localKeys.autoAddToFORQ, false),
    preferDueCards: readBoolean(localKeys.preferDueCards, false),
    customWordCSS: readString(localKeys.customWordCSS, ""),
    customPopupCSS: readString(localKeys.customPopupCSS, ""),
  };
}

export function readJpdbApiKeyFromCookies(): string {
  const m1 = document.cookie.match(/(?:^|;\\s*)jpdbApiKey=([^;]+)/);
  const m2 = document.cookie.match(/(?:^|;\\s*)jpdb_api_key=([^;]+)/);
  return m1?.[1] || m2?.[1] || "";
}

export function syncLocalSettingsToStorage(localState: LocalSettingsState): void {
  const keys = Object.keys(localKeys) as Array<keyof LocalSettingsState>;
  for (const key of keys) {
    const storageKey = localKeys[key];
    const value = localState[key];
    localStorage.setItem(storageKey, typeof value === "boolean" ? String(value) : String(value));
  }

  for (const deprecatedKey of DEPRECATED_STORAGE_KEYS) {
    localStorage.removeItem(deprecatedKey);
  }
}

export function syncJpdbApiKeyToCookies(jpdbApiKey: string): void {
  if (jpdbApiKey) {
    document.cookie = `jpdbApiKey=${jpdbApiKey}; path=/;`;
    document.cookie = `jpdb_api_key=${jpdbApiKey}; path=/;`;
    return;
  }

  // Clear cookies when key is removed to avoid stale values.
  document.cookie = `jpdbApiKey=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
  document.cookie = `jpdb_api_key=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
}

export function syncSettingsToStorage(params: {
  localState: LocalSettingsState;
  jpdbApiKey: string;
}): void {
  syncLocalSettingsToStorage(params.localState);
  syncJpdbApiKeyToCookies(params.jpdbApiKey);
  appLog.debug("[SettingsModal] Synced settings to localStorage/cookies");
}


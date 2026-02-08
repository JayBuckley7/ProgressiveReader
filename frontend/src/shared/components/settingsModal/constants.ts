import type { LocalSettingsState, SettingsModalTabId } from "./types";

// LocalStorage keys used across the app (JPDB integration expects these exact names).
export const localKeys = {
  openaiKey: "openaiKey",
  openaiModel: "openaiModel",
  cefrLevel: "cefrLevel",
  autoload: "autoloadTranslations",
  jpdbDeckId: "jpdbMiningDeckId",
  forqDeckId: "forqDeckId",
  blacklistDeckId: "blacklistDeckId",
  neverForgetDeckId: "neverForgetDeckId",
  contextSentenceCount: "contextWidth",
  autoAddToFORQ: "forqOnMine",
  preferDueCards: "preferDueCards",
  customWordCSS: "customWordCSS",
  customPopupCSS: "customPopupCSS",
} as const satisfies Record<keyof LocalSettingsState, string>;

export const SETTINGS_TABS: SettingsModalTabId[] = [
  "general",
  "highlight",
  "accessibility",
];

export const DEPRECATED_STORAGE_KEYS = ["useServerKey", "useOfflineParser"] as const;


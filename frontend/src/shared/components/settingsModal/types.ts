import type { useSettings } from "@shared/contexts/SettingsContext";

export type SettingsModalTabId = "general" | "highlight" | "accessibility";

export type AppSettings = NonNullable<ReturnType<typeof useSettings>["settings"]>;
export type UpdateAppSettings = ReturnType<typeof useSettings>["updateSettings"];
export type AppSettingsUpdates = Parameters<UpdateAppSettings>[0];

export type LocalSettingsState = {
  openaiKey: string;
  openaiModel: string;
  cefrLevel: number;
  autoload: boolean;
  jpdbDeckId: string;
  forqDeckId: string;
  blacklistDeckId: string;
  neverForgetDeckId: string;
  contextSentenceCount: number;
  autoAddToFORQ: boolean;
  preferDueCards: boolean;
  customWordCSS: string;
  customPopupCSS: string;
};

export type UpdateLocalSettings = <K extends keyof LocalSettingsState>(
  key: K,
  value: LocalSettingsState[K]
) => void;


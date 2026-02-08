import type { PreferencesPort } from "@core/prefs/ports";
import { DEFAULTS, PREF_KEYS } from "@core/prefs/keys";

function safeGetItem(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // ignore (private mode / disabled storage)
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseBool(raw: string | null): boolean | null {
  if (raw === null) return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

export function createPreferencesPort(): PreferencesPort {
  return {
    getOpenAiKey(): string | null {
      const raw = safeGetItem(PREF_KEYS.openAiKey);
      const v = (raw || "").trim();
      return v ? v : null;
    },
    setOpenAiKey(value: string | null): void {
      const v = (value || "").trim();
      if (!v) safeRemoveItem(PREF_KEYS.openAiKey);
      else safeSetItem(PREF_KEYS.openAiKey, v);
    },

    getOpenAiModel(): string {
      const raw = safeGetItem(PREF_KEYS.openAiModel);
      const v = (raw || "").trim();
      return v || DEFAULTS.openAiModel;
    },
    setOpenAiModel(value: string): void {
      const v = (value || "").trim();
      safeSetItem(PREF_KEYS.openAiModel, v || DEFAULTS.openAiModel);
    },

    getCefrLevel(): string {
      const raw = safeGetItem(PREF_KEYS.cefrLevel);
      const v = (raw || "").trim();
      return v || DEFAULTS.cefrLevel;
    },
    setCefrLevel(value: string): void {
      const v = (value || "").trim();
      safeSetItem(PREF_KEYS.cefrLevel, v || DEFAULTS.cefrLevel);
    },

    getAutoloadTranslations(): boolean {
      return safeGetItem(PREF_KEYS.autoloadTranslations) === "true";
    },
    setAutoloadTranslations(value: boolean): void {
      safeSetItem(PREF_KEYS.autoloadTranslations, value ? "true" : "false");
    },

    getDisableMix(): boolean {
      return safeGetItem(PREF_KEYS.disableMix) === "true";
    },
    setDisableMix(value: boolean): void {
      safeSetItem(PREF_KEYS.disableMix, value ? "true" : "false");
    },

    getGrammarMiningEnabled(): boolean | null {
      return parseBool(safeGetItem(PREF_KEYS.grammarMiningEnabled));
    },
    setGrammarMiningEnabled(value: boolean): void {
      safeSetItem(PREF_KEYS.grammarMiningEnabled, value ? "true" : "false");
    },

    getGrammarUnderlinesEnabled(): boolean | null {
      return parseBool(safeGetItem(PREF_KEYS.grammarUnderlinesEnabled));
    },
    setGrammarUnderlinesEnabled(value: boolean): void {
      safeSetItem(PREF_KEYS.grammarUnderlinesEnabled, value ? "true" : "false");
    },

    getString(key: string): string | null {
      const raw = safeGetItem(key);
      return raw === null ? null : String(raw);
    },
    setString(key: string, value: string): void {
      safeSetItem(key, String(value));
    },
    remove(key: string): void {
      safeRemoveItem(key);
    },
    getBool(key: string): boolean | null {
      return parseBool(safeGetItem(key));
    },
    setBool(key: string, value: boolean): void {
      safeSetItem(key, value ? "true" : "false");
    },
  };
}


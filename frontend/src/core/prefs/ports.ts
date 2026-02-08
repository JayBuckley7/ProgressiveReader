export interface PreferencesPort {
  // Strongly-typed app prefs (centralized keys/defaults).
  getOpenAiKey(): string | null;
  setOpenAiKey(value: string | null): void;

  getOpenAiModel(): string;
  setOpenAiModel(value: string): void;

  getCefrLevel(): string;
  setCefrLevel(value: string): void;

  getAutoloadTranslations(): boolean;
  setAutoloadTranslations(value: boolean): void;

  getDisableMix(): boolean;
  setDisableMix(value: boolean): void;

  getGrammarMiningEnabled(): boolean | null;
  setGrammarMiningEnabled(value: boolean): void;

  getGrammarUnderlinesEnabled(): boolean | null;
  setGrammarUnderlinesEnabled(value: boolean): void;

  // Generic helpers (escape hatch; use sparingly).
  getString(key: string): string | null;
  setString(key: string, value: string): void;
  remove(key: string): void;

  getBool(key: string): boolean | null;
  setBool(key: string, value: boolean): void;
}


import type { AppSettings, AppSettingsUpdates, LocalSettingsState } from "./types";

const allowedThemes = ["system", "light", "dark", "wood", "space"] as const;
type AllowedTheme = (typeof allowedThemes)[number];

function isAllowedTheme(value: string): value is AllowedTheme {
  return (allowedThemes as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function readOptionalBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const v = obj[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
}

function readOptionalNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function readOptionalInt(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function createSettingsObject(params: {
  localState: LocalSettingsState;
  settings: AppSettings;
  jpdbApiKey: string;
}): Record<string, unknown> {
  const { localState, settings, jpdbApiKey } = params;

  return {
    // API and model settings
    openai_api_key: localState.openaiKey,
    jpdb_api_key: jpdbApiKey,
    openai_model: localState.openaiModel,
    target_language: settings.targetLanguage,
    uiLanguage: settings.uiLanguage,
    cefr_index: String(localState.cefrLevel),

    // Display settings
    userTheme: settings.theme,
    fontSize: String(settings.fontSize),
    autoload_preference: localState.autoload,
    prefer_due_cards: localState.preferDueCards,

    // JPDB deck settings
    jpdbMiningDeckId: localState.jpdbDeckId,
    customWordCSS: localState.customWordCSS,
    forqDeckId: localState.forqDeckId,
    blacklistDeckId: localState.blacklistDeckId,
    neverForgetDeckId: localState.neverForgetDeckId,
    contextWidth: String(localState.contextSentenceCount),
    forqOnMine: localState.autoAddToFORQ,

    // Keybind settings (legacy fields)
    showPopupKey: "None",
    addKey: "None",
    dialogKey: "None",
    blacklistKey: "None",
    neverForgetKey: "None",
    nothingKey: "None",
    somethingKey: "None",
    hardKey: "None",
    goodKey: "None",
    easyKey: "None",

    // Accessibility settings
    showPopupOnHover: settings.showPopupOnHover ?? true,
    touchscreenSupport: settings.touchscreenSupport ?? false,
    disableFadeAnimation: settings.disableFadeAnimation ?? false,
    hideFurigana: settings.hideFurigana ?? false,
    cacheTranslations: settings.cacheTranslations ?? true,
    verticalWriting: settings.verticalWriting ?? false,
    customPopupCSS: localState.customPopupCSS,

    // Mix mode (English -> Mixed JP)
    mix_enabled: settings.mixEnabled ?? false,
    mix_aggression: settings.mixAggression ?? 0.25,
    mix_auto_enable_highlight: settings.mixAutoEnableHighlight ?? true,
    mix_backup_mirror_to_drive: settings.mixBackupMirrorToDrive ?? true,
    mix_mirror_stale_after_hours: settings.mixMirrorStaleAfterHours ?? 24,
  };
}

export function coerceImportedSettings(params: {
  imported: unknown;
  currentLocalState: LocalSettingsState;
}): {
  nextLocalState: LocalSettingsState;
  nextJpdbApiKey?: string;
  settingsUpdates: AppSettingsUpdates;
} {
  const { imported, currentLocalState } = params;
  if (!isRecord(imported)) {
    return { nextLocalState: currentLocalState, settingsUpdates: {} };
  }

  // Local settings
  const nextLocalState: LocalSettingsState = {
    ...currentLocalState,
    openaiKey: readOptionalString(imported, "openai_api_key") ?? currentLocalState.openaiKey,
    openaiModel: readOptionalString(imported, "openai_model") ?? currentLocalState.openaiModel,
    cefrLevel: readOptionalInt(imported, "cefr_index") ?? currentLocalState.cefrLevel,
    autoload: readOptionalBoolean(imported, "autoload_preference") ?? currentLocalState.autoload,
    jpdbDeckId: readOptionalString(imported, "jpdbMiningDeckId") ?? currentLocalState.jpdbDeckId,
    forqDeckId: readOptionalString(imported, "forqDeckId") ?? currentLocalState.forqDeckId,
    blacklistDeckId: readOptionalString(imported, "blacklistDeckId") ?? currentLocalState.blacklistDeckId,
    neverForgetDeckId: readOptionalString(imported, "neverForgetDeckId") ?? currentLocalState.neverForgetDeckId,
    contextSentenceCount:
      Math.max(1, readOptionalInt(imported, "contextWidth") ?? currentLocalState.contextSentenceCount) || 1,
    autoAddToFORQ: readOptionalBoolean(imported, "forqOnMine") ?? currentLocalState.autoAddToFORQ,
    preferDueCards: readOptionalBoolean(imported, "prefer_due_cards") ?? currentLocalState.preferDueCards,
    customWordCSS: readOptionalString(imported, "customWordCSS") ?? currentLocalState.customWordCSS,
    customPopupCSS: readOptionalString(imported, "customPopupCSS") ?? currentLocalState.customPopupCSS,
  };

  // JPDB API key
  let nextJpdbApiKey: string | undefined;
  if (hasOwn(imported, "jpdb_api_key")) {
    const raw = imported.jpdb_api_key;
    if (typeof raw === "string") {
      nextJpdbApiKey = raw;
    } else if (raw === null || raw === undefined) {
      nextJpdbApiKey = "";
    }
  }

  // Context settings updates
  const settingsUpdates: AppSettingsUpdates = {};

  const targetLanguage = readOptionalString(imported, "target_language");
  if (targetLanguage !== undefined) settingsUpdates.targetLanguage = targetLanguage;

  const uiLanguage = readOptionalString(imported, "uiLanguage");
  if (uiLanguage !== undefined) settingsUpdates.uiLanguage = uiLanguage;

  const userTheme = readOptionalString(imported, "userTheme");
  if (userTheme !== undefined && isAllowedTheme(userTheme)) settingsUpdates.theme = userTheme;

  const fontSize = readOptionalInt(imported, "fontSize");
  if (fontSize !== undefined) settingsUpdates.fontSize = fontSize || 16;

  const showPopupOnHover = readOptionalBoolean(imported, "showPopupOnHover");
  if (showPopupOnHover !== undefined) settingsUpdates.showPopupOnHover = showPopupOnHover;

  const touchscreenSupport = readOptionalBoolean(imported, "touchscreenSupport");
  if (touchscreenSupport !== undefined) settingsUpdates.touchscreenSupport = touchscreenSupport;

  const disableFadeAnimation = readOptionalBoolean(imported, "disableFadeAnimation");
  if (disableFadeAnimation !== undefined) settingsUpdates.disableFadeAnimation = disableFadeAnimation;

  const hideFurigana = readOptionalBoolean(imported, "hideFurigana");
  if (hideFurigana !== undefined) settingsUpdates.hideFurigana = hideFurigana;

  const cacheTranslations = readOptionalBoolean(imported, "cacheTranslations");
  if (cacheTranslations !== undefined) settingsUpdates.cacheTranslations = cacheTranslations;

  const verticalWriting =
    readOptionalBoolean(imported, "verticalWriting") ??
    readOptionalBoolean(imported, "vertical_writing");
  if (verticalWriting !== undefined) settingsUpdates.verticalWriting = verticalWriting;

  // Mix mode settings
  if (hasOwn(imported, "mix_enabled")) {
    settingsUpdates.mixEnabled = Boolean(imported.mix_enabled);
  }

  if (hasOwn(imported, "mix_aggression")) {
    const n = readOptionalNumber(imported, "mix_aggression");
    if (n !== undefined && Number.isFinite(n)) {
      settingsUpdates.mixAggression = Math.max(0, Math.min(1, n));
    }
  }

  if (hasOwn(imported, "mix_auto_enable_highlight")) {
    settingsUpdates.mixAutoEnableHighlight = Boolean(imported.mix_auto_enable_highlight);
  }

  if (hasOwn(imported, "mix_backup_mirror_to_drive")) {
    settingsUpdates.mixBackupMirrorToDrive = Boolean(imported.mix_backup_mirror_to_drive);
  }

  if (hasOwn(imported, "mix_mirror_stale_after_hours")) {
    const n = readOptionalInt(imported, "mix_mirror_stale_after_hours");
    if (n !== undefined && n > 0) settingsUpdates.mixMirrorStaleAfterHours = n;
  }

  return { nextLocalState, nextJpdbApiKey, settingsUpdates };
}

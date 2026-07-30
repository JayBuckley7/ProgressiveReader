import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAppData } from "./AppDataContext";
import { toast } from "sonner";
import i18n from "~/i18n";
import { appLog } from '@shared/appLog'
import { useAppDeps } from "@app/deps/AppDepsProvider";
import { useLocation } from "react-router-dom";

type Theme = "light" | "dark" | "wood" | "space" | "system";

interface Settings {
  theme: Theme;
  fontSize: number;
  fontFamily: string;
  ttsSpeed: number;
  jlptEnabled: boolean;
  autoTranslate: boolean;
  targetLanguage: string;
  uiLanguage: string;
  customCss?: string;
  showPopupOnHover?: boolean;
  touchscreenSupport?: boolean;
  disableFadeAnimation?: boolean;
  cacheTranslations?: boolean;
  hideFurigana?: boolean;
  verticalWriting?: boolean;

  // English -> Mixed JP "known-word swap" reader mode
  mixEnabled: boolean;
  mixAggression: number; // 0..1
  mixAutoEnableHighlight: boolean;
  mixBackupMirrorToDrive: boolean;
  mixMirrorStaleAfterHours: number;
}

interface SettingsContextType {
  settings: Settings | null;
  updateSettings: (updates: Partial<Settings>) => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const defaultSettings: Settings = {
  theme: "system",
  fontSize: 16,
  fontFamily: "Inter",
  ttsSpeed: 1,
  jlptEnabled: false,
  autoTranslate: false,
  targetLanguage: "English",
  uiLanguage: "en",
  customCss: "",
  showPopupOnHover: true,
  touchscreenSupport: true,
  disableFadeAnimation: false,
  cacheTranslations: true,
  hideFurigana: false,
  verticalWriting: false,

  mixEnabled: false,
  mixAggression: 0.25,
  mixAutoEnableHighlight: true,
  mixBackupMirrorToDrive: true,
  mixMirrorStaleAfterHours: 24,
};

const SETTINGS_COOKIE = "prSettings";
const SETTINGS_STORAGE = "prSettings";

function coerceBooleanSetting(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function mapExternalSettings(data: Record<string, any>, prev: Settings): Settings {
  const updates: Partial<Settings> = {};

  if (data.userTheme !== undefined) updates.theme = data.userTheme;
  if (data.theme !== undefined) updates.theme = data.theme;
  if (data.fontSize !== undefined) updates.fontSize = parseInt(String(data.fontSize), 10) || prev.fontSize;
  if (data.target_language !== undefined) updates.targetLanguage = data.target_language;
  if (data.targetLanguage !== undefined) updates.targetLanguage = data.targetLanguage;
  if (data.uiLanguage !== undefined) updates.uiLanguage = data.uiLanguage;
  if (data.showPopupOnHover !== undefined) updates.showPopupOnHover = data.showPopupOnHover;
  if (data.touchscreenSupport !== undefined) updates.touchscreenSupport = data.touchscreenSupport;
  if (data.disableFadeAnimation !== undefined) updates.disableFadeAnimation = data.disableFadeAnimation;
  if (data.hideFurigana !== undefined) updates.hideFurigana = data.hideFurigana;
  if (data.cacheTranslations !== undefined) updates.cacheTranslations = data.cacheTranslations;
  const verticalWritingRaw = data.vertical_writing ?? data.verticalWriting;
  if (verticalWritingRaw !== undefined) {
    updates.verticalWriting = coerceBooleanSetting(verticalWritingRaw);
  }

  const mixEnabledRaw = data.mix_enabled ?? data.mixEnabled;
  if (mixEnabledRaw !== undefined) updates.mixEnabled = Boolean(mixEnabledRaw);

  const mixAggressionRaw = data.mix_aggression ?? data.mixAggression;
  if (mixAggressionRaw !== undefined) {
    const parsed = typeof mixAggressionRaw === 'number' ? mixAggressionRaw : parseFloat(String(mixAggressionRaw));
    if (Number.isFinite(parsed)) {
      updates.mixAggression = Math.max(0, Math.min(1, parsed));
    }
  }

  const mixAutoHighlightRaw = data.mix_auto_enable_highlight ?? data.mixAutoEnableHighlight;
  if (mixAutoHighlightRaw !== undefined) updates.mixAutoEnableHighlight = Boolean(mixAutoHighlightRaw);

  const mixBackupRaw = data.mix_backup_mirror_to_drive ?? data.mixBackupMirrorToDrive;
  if (mixBackupRaw !== undefined) updates.mixBackupMirrorToDrive = Boolean(mixBackupRaw);

  const mixStaleRaw = data.mix_mirror_stale_after_hours ?? data.mixMirrorStaleAfterHours;
  if (mixStaleRaw !== undefined) {
    const parsed = typeof mixStaleRaw === 'number' ? mixStaleRaw : parseInt(String(mixStaleRaw), 10);
    if (Number.isFinite(parsed) && parsed > 0) updates.mixMirrorStaleAfterHours = parsed;
  }

  return { ...prev, ...updates };
}

function syncReaderSettingsToStorage(settings: Settings): void {
  localStorage.setItem('showPopupOnHover', String(settings.showPopupOnHover));
  localStorage.setItem('touchscreenSupport', String(settings.touchscreenSupport));
  localStorage.setItem('disableFadeAnimation', String(settings.disableFadeAnimation));
  localStorage.setItem('cacheTranslations', String(settings.cacheTranslations));
  localStorage.setItem('hideFurigana', String(settings.hideFurigana ?? false));
  setSettingsStorage(settings);
  setSettingsCookie(settings);
}

function syncJpdbTestSettings(data: Record<string, any>): void {
  const key = (import.meta.env.VITE_TEST_READER_JPDB_API_KEY || data.jpdb_api_key || data.jpdbApiKey || "").trim();
  if (key) {
    const encoded = encodeURIComponent(key);
    document.cookie = `jpdbApiKey=${encoded}; path=/;`;
    document.cookie = `jpdb_api_key=${encoded}; path=/;`;
  }

  const pairs: Array<[string, any]> = [
    ['jpdbMiningDeckId', data.jpdbMiningDeckId],
    ['forqDeckId', data.forqDeckId],
    ['blacklistDeckId', data.blacklistDeckId],
    ['neverForgetDeckId', data.neverForgetDeckId],
    ['contextWidth', data.contextWidth],
    ['forqOnMine', data.forqOnMine],
    ['customWordCSS', data.customWordCSS],
    ['customPopupCSS', data.customPopupCSS],
  ];
  for (const [storageKey, value] of pairs) {
    if (value !== undefined && value !== null) {
      localStorage.setItem(storageKey, String(value));
    }
  }

  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("pr:jpdb-settings-updated"));
  }, 0);
}

function getSettingsStorage(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    appLog.warn("[Settings] Failed to parse settings from localStorage", error);
    return null;
  }
}

function setSettingsStorage(data: Partial<Settings>): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(data));
  } catch (error) {
    appLog.warn("[Settings] Failed to persist settings to localStorage", error);
  }
}

function clearSettingsStorage(): void {
  localStorage.removeItem(SETTINGS_STORAGE);
}

function getSettingsCookie(): Partial<Settings> | null {
  const match = document.cookie.match(new RegExp(`${SETTINGS_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch (error) {
    appLog.warn("[Settings] Failed to parse settings cookie", error);
    return null;
  }
}

function setSettingsCookie(data: Partial<Settings>): void {
  document.cookie = `${SETTINGS_COOKIE}=${encodeURIComponent(
    JSON.stringify(data)
  )}; path=/`;
}

function clearSettingsCookie(): void {
  document.cookie = `${SETTINGS_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const deps = useAppDeps();
  const location = useLocation();
  const testReaderMode = location.pathname === "/pdf" || location.pathname === "/epub";
  // Settings are stored locally and optionally synced to Google Drive (browser-only).
  const [currentSettings, setCurrentSettings] = useState<Settings>(defaultSettings);
  const [isLoadingFromCloud, setIsLoadingFromCloud] = useState(false);
  const { isAuthenticated, loadSettings, saveSettings, books } = useAppData();
  const loadedFromCloudRef = useRef(false);
  const cloudLoadInFlightRef = useRef(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cloudLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load settings from localStorage or cookie on initial mount
  useEffect(() => {
    if (testReaderMode) {
      const settingsUrl = import.meta.env.VITE_TEST_READER_SETTINGS_URL;
      let cancelled = false;

      const loadTestSettings = async () => {
        try {
          const data = settingsUrl
            ? await fetch(settingsUrl).then((response) => {
                if (!response.ok) throw new Error(`Failed to load test settings: ${response.status}`);
                return response.json();
              })
            : {};
          if (cancelled) return;

          setCurrentSettings((prev) => {
            const updated = mapExternalSettings(data, prev);
            syncReaderSettingsToStorage(updated);
            syncJpdbTestSettings(data);
            return updated;
          });
        } catch (error) {
          appLog.error("[Settings] Failed to load test reader settings", error);
          if (!cancelled) {
            syncJpdbTestSettings({});
          }
        }
      };

      void loadTestSettings();
      return () => {
        cancelled = true;
      };
    }

    const stored = getSettingsStorage() || getSettingsCookie();
    if (stored) {
      setCurrentSettings(prev => {
        const updated = { ...prev, ...stored };

        if (!updated.uiLanguage) {
          updated.uiLanguage = defaultSettings.uiLanguage;
        }

        // Sync accessibility settings to localStorage for JPDB integration
        localStorage.setItem('showPopupOnHover', String(updated.showPopupOnHover));
        localStorage.setItem('touchscreenSupport', String(updated.touchscreenSupport));
        localStorage.setItem('disableFadeAnimation', String(updated.disableFadeAnimation));
        localStorage.setItem('cacheTranslations', String(updated.cacheTranslations));
        localStorage.setItem('hideFurigana', String(updated.hideFurigana ?? false));
        appLog.debug('[Settings] Initial sync of accessibility settings to localStorage');

        setSettingsStorage(updated);



        return updated;
      });
    } else {
      // If no cookie settings, sync defaults to localStorage
      localStorage.setItem('showPopupOnHover', String(defaultSettings.showPopupOnHover));
      localStorage.setItem('touchscreenSupport', String(defaultSettings.touchscreenSupport));
      localStorage.setItem('disableFadeAnimation', String(defaultSettings.disableFadeAnimation));
      localStorage.setItem('cacheTranslations', String(defaultSettings.cacheTranslations));
      localStorage.setItem('hideFurigana', String(defaultSettings.hideFurigana));
      appLog.debug('[Settings] Initial sync of default accessibility settings to localStorage');
      setSettingsStorage(defaultSettings);
      i18n.changeLanguage(defaultSettings.uiLanguage);
    }
  }, [testReaderMode]);

  // Listen to centralized auth manager for settings loading
  useEffect(() => {
    if (testReaderMode) return;
    // Listen for authentication state changes through auth manager
    const unsubscribe = deps.driveAuth.onAuthStateChange(async (isAuthenticated) => {
      if (isAuthenticated && !loadedFromCloudRef.current && !isLoadingFromCloud && !cloudLoadInFlightRef.current) {
        cloudLoadInFlightRef.current = true;
        setIsLoadingFromCloud(true);
        try {
          appLog.debug('[Settings] Auto-loading settings from Google Drive after authentication');
          // Don't call driveAuth.ensureAuthenticated() again since we're already in auth callback
          const data = await deps.drive.loadSettings();
          if (data && Object.keys(data).length > 0) {
            appLog.debug('[Settings] Settings auto-loaded from Google Drive successfully');
            toast.success('Settings synced from Google Drive', {
              description: 'Your preferences have been loaded automatically',
              duration: 3000
            });
            setCurrentSettings(prev => {
              // Map comprehensive settings format back to basic Settings interface
              const basicSettingsUpdates: Partial<Settings> = {};

              if (data.userTheme !== undefined) basicSettingsUpdates.theme = data.userTheme;
              if (data.fontSize !== undefined) basicSettingsUpdates.fontSize = parseInt(data.fontSize) || prev.fontSize;
              if (data.target_language !== undefined) basicSettingsUpdates.targetLanguage = data.target_language;
              if ((data as any).uiLanguage !== undefined) basicSettingsUpdates.uiLanguage = (data as any).uiLanguage;
              if (data.showPopupOnHover !== undefined) basicSettingsUpdates.showPopupOnHover = data.showPopupOnHover;
              if (data.touchscreenSupport !== undefined) basicSettingsUpdates.touchscreenSupport = data.touchscreenSupport;
              if (data.disableFadeAnimation !== undefined) basicSettingsUpdates.disableFadeAnimation = data.disableFadeAnimation;
              if (data.hideFurigana !== undefined) basicSettingsUpdates.hideFurigana = data.hideFurigana;
              if (data.cacheTranslations !== undefined) basicSettingsUpdates.cacheTranslations = data.cacheTranslations;
              const verticalWritingRaw = (data as any).vertical_writing ?? (data as any).verticalWriting;
              if (verticalWritingRaw !== undefined) {
                basicSettingsUpdates.verticalWriting = coerceBooleanSetting(verticalWritingRaw);
              }

              // Mix mode settings (support both snake_case and camelCase keys for backward/forward compatibility)
              const mixEnabledRaw = (data as any).mix_enabled ?? (data as any).mixEnabled;
              if (mixEnabledRaw !== undefined) basicSettingsUpdates.mixEnabled = Boolean(mixEnabledRaw);

              const mixAggressionRaw = (data as any).mix_aggression ?? (data as any).mixAggression;
              if (mixAggressionRaw !== undefined) {
                const parsed = typeof mixAggressionRaw === 'number' ? mixAggressionRaw : parseFloat(String(mixAggressionRaw));
                if (Number.isFinite(parsed)) {
                  basicSettingsUpdates.mixAggression = Math.max(0, Math.min(1, parsed));
                }
              }

              const mixAutoHighlightRaw = (data as any).mix_auto_enable_highlight ?? (data as any).mixAutoEnableHighlight;
              if (mixAutoHighlightRaw !== undefined) basicSettingsUpdates.mixAutoEnableHighlight = Boolean(mixAutoHighlightRaw);

              const mixBackupRaw = (data as any).mix_backup_mirror_to_drive ?? (data as any).mixBackupMirrorToDrive;
              if (mixBackupRaw !== undefined) basicSettingsUpdates.mixBackupMirrorToDrive = Boolean(mixBackupRaw);

              const mixStaleRaw = (data as any).mix_mirror_stale_after_hours ?? (data as any).mixMirrorStaleAfterHours;
              if (mixStaleRaw !== undefined) {
                const parsed = typeof mixStaleRaw === 'number' ? mixStaleRaw : parseInt(String(mixStaleRaw), 10);
                if (Number.isFinite(parsed) && parsed > 0) basicSettingsUpdates.mixMirrorStaleAfterHours = parsed;
              }

              const updated = { ...prev, ...basicSettingsUpdates };
              setSettingsCookie(updated);
              setSettingsStorage(updated);

              // Sync accessibility settings to localStorage for JPDB integration
              localStorage.setItem('showPopupOnHover', String(updated.showPopupOnHover));
              localStorage.setItem('touchscreenSupport', String(updated.touchscreenSupport));
              localStorage.setItem('disableFadeAnimation', String(updated.disableFadeAnimation));
              localStorage.setItem('cacheTranslations', String(updated.cacheTranslations));
              localStorage.setItem('hideFurigana', String(updated.hideFurigana ?? false));
              appLog.debug('[Settings] Auto-synced accessibility settings to localStorage');



              // Also set JPDB API key cookies if present in cloud settings
              let syncedJpdbKeyFromCloud = false;
              try {
                const cloudJpdbKey = (data as any).jpdb_api_key;
                if (typeof cloudJpdbKey === 'string' && cloudJpdbKey.length > 0) {
                  const encoded = encodeURIComponent(cloudJpdbKey);
                  document.cookie = `jpdbApiKey=${encoded}; path=/;`;
                  document.cookie = `jpdb_api_key=${encoded}; path=/;`;
                  syncedJpdbKeyFromCloud = true;
                  appLog.debug('[Settings] JPDB API key synced from cloud into cookies');
                }
              } catch (e) {
                appLog.warn('[Settings] Failed to sync JPDB key from cloud settings', e);
              }

              // Additionally, sync JPDB-related prefs into localStorage for the highlighter
              try {
                const mapPairs: Array<[string, any]> = [
                  ['jpdbMiningDeckId', (data as any).jpdbMiningDeckId],
                  ['forqDeckId', (data as any).forqDeckId],
                  ['blacklistDeckId', (data as any).blacklistDeckId],
                  ['neverForgetDeckId', (data as any).neverForgetDeckId],
                  ['contextWidth', (data as any).contextWidth],
                  ['forqOnMine', (data as any).forqOnMine],
                  ['customWordCSS', (data as any).customWordCSS],
                  ['customPopupCSS', (data as any).customPopupCSS],
                ];
                for (const [k, v] of mapPairs) {
                  if (v !== undefined && v !== null) {
                    localStorage.setItem(k, String(v));
                  }
                }
                if (syncedJpdbKeyFromCloud) {
                  window.setTimeout(() => {
                    window.dispatchEvent(new CustomEvent("pr:jpdb-settings-updated"));
                  }, 0);
                }
              } catch {
                // ignore (private mode / disabled storage)
              }

              return updated;
            });
          } else {
            appLog.debug('[Settings] No settings.json found in Google Drive; using local settings');
          }
          loadedFromCloudRef.current = true;
        } catch (err) {
          appLog.error('[Settings] Failed to auto-load settings from Google Drive', err);
          loadedFromCloudRef.current = true; // Mark as attempted to avoid infinite retries
        } finally {
          cloudLoadInFlightRef.current = false;
          setIsLoadingFromCloud(false);
        }
      } else if (!isAuthenticated) {
        loadedFromCloudRef.current = false;
        cloudLoadInFlightRef.current = false;
        setIsLoadingFromCloud(false);
        clearSettingsCookie();
        clearSettingsStorage();
      }
    });

    return unsubscribe;
  }, [deps.driveAuth, isLoadingFromCloud, testReaderMode]);

  // Settings are needed before the reader decides whether JPDB highlighting can
  // use the real JPDB API. Do not depend on the library sync path to initialize
  // Drive auth; routes like clipboard or direct book loads can otherwise start
  // with only local defaults and stay on fallback highlighting.
  useEffect(() => {
    if (testReaderMode) return;
    if (!isAuthenticated) return;
    if (loadedFromCloudRef.current || isLoadingFromCloud || cloudLoadInFlightRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const authed = await deps.driveAuth.ensureAuthenticated();
        if (!cancelled && !authed) {
          appLog.debug('[Settings] Google Drive auth unavailable for automatic settings load');
        }
      } catch (error) {
        if (!cancelled) {
          appLog.warn('[Settings] Failed to initialize Drive auth for settings load', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deps.driveAuth, isAuthenticated, isLoadingFromCloud, testReaderMode]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (cloudLoadTimeoutRef.current) {
        clearTimeout(cloudLoadTimeoutRef.current);
      }
    };
  }, []);

  const settings = currentSettings; // Use state directly

  const updateSettings = (updates: Partial<Settings>) => {
    appLog.debug("Updating settings:", updates);

    setCurrentSettings(prev => {
      const updatedRaw = { ...prev, ...updates };
      // Clamp numeric settings that are user-controlled and can drift.
      const mixAgg = Number(updatedRaw.mixAggression ?? 0.25);
      const staleHours = Number(updatedRaw.mixMirrorStaleAfterHours ?? 24);
      const updated: Settings = {
        ...updatedRaw,
        mixAggression: Number.isFinite(mixAgg) ? Math.max(0, Math.min(1, mixAgg)) : prev.mixAggression,
        mixMirrorStaleAfterHours: Number.isFinite(staleHours)
          ? Math.max(1, Math.min(24 * 30, staleHours))
          : prev.mixMirrorStaleAfterHours,
      } as Settings;
      setSettingsCookie(updated);
      setSettingsStorage(updated);

      // Sync accessibility settings to localStorage for JPDB integration
      if ('showPopupOnHover' in updates) {
        localStorage.setItem('showPopupOnHover', String(updated.showPopupOnHover));
        appLog.debug('[Settings] Synced showPopupOnHover to localStorage', updated.showPopupOnHover);
      }
      if ('touchscreenSupport' in updates) {
        localStorage.setItem('touchscreenSupport', String(updated.touchscreenSupport));
        appLog.debug('[Settings] Synced touchscreenSupport to localStorage', updated.touchscreenSupport);
      }
      if ('disableFadeAnimation' in updates) {
        localStorage.setItem('disableFadeAnimation', String(updated.disableFadeAnimation));
        appLog.debug('[Settings] Synced disableFadeAnimation to localStorage', updated.disableFadeAnimation);
      }
      if ('cacheTranslations' in updates) {
        localStorage.setItem('cacheTranslations', String(updated.cacheTranslations));
      }
      if ('hideFurigana' in updates) {
        localStorage.setItem('hideFurigana', String(updated.hideFurigana));
        appLog.debug('[Settings] Synced hideFurigana to localStorage', updated.hideFurigana);
      }



      // Auto-save to cloud with debouncing
      if (!testReaderMode && isAuthenticated && loadedFromCloudRef.current) {
        // Clear any existing timeout
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }

        // Set a new timeout to save after 2 seconds of no changes
        autoSaveTimeoutRef.current = setTimeout(async () => {
          try {
            appLog.debug('[Settings] Auto-saving settings to cloud');

            // First, load existing comprehensive settings to preserve API keys and other fields
            const existingSettingsRaw = await loadSettings();
            const existingSettings = (existingSettingsRaw && typeof existingSettingsRaw === 'object') ? existingSettingsRaw : {};
            appLog.debug('[Settings] Existing settings loaded for merge', existingSettings);

            // Merge the basic settings with existing comprehensive settings
            const preserved = { ...existingSettings } as any;
            // Ensure JPDB API key is preserved from cookies if not yet saved in cloud
            if (!preserved.jpdb_api_key) {
              try {
                const m1 = document.cookie.match(/(?:^|;\s*)jpdbApiKey=([^;]+)/);
                const m2 = document.cookie.match(/(?:^|;\s*)jpdb_api_key=([^;]+)/);
                const cookieKey = m1?.[1] || m2?.[1];
                if (cookieKey) preserved.jpdb_api_key = cookieKey;
              } catch {
                // ignore cookie access issues
              }
            }

            const settingsToSave = {
              ...preserved, // Preserve existing comprehensive settings and keys like jpdb_api_key
              // Map basic settings to the expected comprehensive format
              userTheme: updated.theme,
              fontSize: String(updated.fontSize),
              target_language: updated.targetLanguage,
              uiLanguage: updated.uiLanguage,
              showPopupOnHover: updated.showPopupOnHover,
              touchscreenSupport: updated.touchscreenSupport,
              disableFadeAnimation: updated.disableFadeAnimation,
              hideFurigana: updated.hideFurigana,
              verticalWriting: updated.verticalWriting,
              mix_enabled: updated.mixEnabled,
              mix_aggression: updated.mixAggression,
              mix_auto_enable_highlight: updated.mixAutoEnableHighlight,
              mix_backup_mirror_to_drive: updated.mixBackupMirrorToDrive,
              mix_mirror_stale_after_hours: updated.mixMirrorStaleAfterHours,
              // Add timestamp and version
              lastUpdated: new Date().toISOString(),
              version: '1.0'
            };

            appLog.debug('[Settings] Auto-saving merged settings', settingsToSave);
            const success = await saveSettings(settingsToSave);
            if (success) {
              appLog.debug('[Settings] Settings auto-saved to cloud successfully (comprehensive format preserved)');
            } else {
              appLog.warn('[Settings] Auto-save to cloud failed');
            }
          } catch (error) {
            appLog.error('[Settings] Error auto-saving settings', error);
          }
        }, 2000);
      }

      return updated;
    });
  };

  // Apply theme to document
  useEffect(() => {
    if (!settings) return;

    const root = document.documentElement;
    root.classList.remove(
      'user-theme-light',
      'user-theme-dark',
      'user-theme-wood',
      'user-theme-space',
      'dark'
    );

    const applySystemPreference = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    if (settings.theme === 'light') {
      root.classList.add('user-theme-light');
    } else if (settings.theme === 'wood') {
      root.classList.add('user-theme-wood');
    } else if (settings.theme === 'dark') {
      root.classList.add('user-theme-dark');
      root.classList.add('dark');
    } else if (settings.theme === 'space') {
      root.classList.add('user-theme-space');
      root.classList.add('dark');
    } else {
      applySystemPreference();
    }

    let mediaQuery: MediaQueryList | null = null;
    if (settings.theme === 'system') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', applySystemPreference);
    }

    return () => {
      mediaQuery?.removeEventListener('change', applySystemPreference);
    };
  }, [settings?.theme]);

  // Apply font size
  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
  }, [settings?.fontSize]);

  useEffect(() => {
    if (settings?.uiLanguage) {
      i18n.changeLanguage(settings.uiLanguage);
    }
  }, [settings?.uiLanguage]);

  // Apply custom CSS
  useEffect(() => {
    if (!settings?.customCss) return;

    let styleElement = document.getElementById('custom-reader-styles') as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'custom-reader-styles';
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = settings.customCss;
  }, [settings?.customCss]);

  // Apply furigana hiding CSS
  useEffect(() => {
    let styleElement = document.getElementById('furigana-hide-styles') as HTMLStyleElement;
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'furigana-hide-styles';
      document.head.appendChild(styleElement);
    }

    if (settings?.hideFurigana) {
      styleElement.textContent = `
        .jpdb-furi,
        rt.jpdb-furi,
        .reader-content-transition ruby rt {
          display: none !important;
        }
      `;
    } else {
      styleElement.textContent = '';
    }
  }, [settings?.hideFurigana]);



  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      isLoading: false, // Was: dbSettings === undefined,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

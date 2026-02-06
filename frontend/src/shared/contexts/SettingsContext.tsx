import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAppData } from "./AppDataContext";
import { authManager } from "@shared/services/authManager";
import { bookMetadataService } from "@features/books/services/bookMetadata";
import { toast } from "sonner";
import i18n from "~/i18n";

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

  mixEnabled: false,
  mixAggression: 0.25,
  mixAutoEnableHighlight: true,
  mixBackupMirrorToDrive: true,
  mixMirrorStaleAfterHours: 24,
};

const SETTINGS_COOKIE = "prSettings";
const SETTINGS_STORAGE = "prSettings";

function getSettingsStorage(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    console.warn("Failed to parse settings from localStorage");
    return null;
  }
}

function setSettingsStorage(data: Partial<Settings>): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(data));
  } catch {
    console.warn("Failed to persist settings to localStorage");
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
  } catch {
    console.warn("Failed to parse settings cookie");
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
  // const dbSettings = useQuery(api.settings.get);
  // const updateSettingsMutation = useMutation(api.settings.update);

  // Placeholder for settings - replace with Flask API calls for persistence
  const [currentSettings, setCurrentSettings] = useState<Settings>(defaultSettings);
  const [isLoadingFromCloud, setIsLoadingFromCloud] = useState(false);
  const { isAuthenticated, loadSettings, saveSettings, books } = useAppData();
  const loadedFromCloudRef = useRef(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cloudLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load settings from localStorage or cookie on initial mount
  useEffect(() => {
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
        console.log('🔔 Initial sync of accessibility settings to localStorage');

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
      console.log('🔔 Initial sync of default accessibility settings to localStorage');
      setSettingsStorage(defaultSettings);
      i18n.changeLanguage(defaultSettings.uiLanguage);
    }
  }, []);

  // Listen to centralized auth manager for settings loading
  useEffect(() => {
    // Listen for authentication state changes through auth manager
    const unsubscribe = authManager.onAuthStateChange(async (isAuthenticated) => {
      if (isAuthenticated && !loadedFromCloudRef.current && !isLoadingFromCloud) {
        setIsLoadingFromCloud(true);
        try {
          console.log('🔄 Auto-loading settings from Google Drive after authentication...');
          // Don't call authManager.ensureAuthenticated() again since we're already in auth callback
          const data = await bookMetadataService.loadSettings();
          if (data && Object.keys(data).length > 0) {
            console.log('✅ Settings auto-loaded from Google Drive successfully');
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
              console.log('🔔 Auto-synced all accessibility settings to localStorage');



              // Also set JPDB API key cookies if present in cloud settings
              try {
                const cloudJpdbKey = (data as any).jpdb_api_key;
                if (typeof cloudJpdbKey === 'string' && cloudJpdbKey.length > 0) {
                  document.cookie = `jpdbApiKey=${cloudJpdbKey}; path=/;`;
                  document.cookie = `jpdb_api_key=${cloudJpdbKey}; path=/;`;
                  console.log('🔑 JPDB API key synced from cloud into cookies');
                }
              } catch (e) {
                console.warn('Failed to sync JPDB key from cloud settings');
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
              } catch { }

              return updated;
            });
          } else {
            console.log('ℹ️ No settings.json found in Google Drive - using local settings');
          }
          loadedFromCloudRef.current = true;
        } catch (err) {
          console.error('❌ Failed to auto-load settings from Google Drive:', err);
          loadedFromCloudRef.current = true; // Mark as attempted to avoid infinite retries
        } finally {
          setIsLoadingFromCloud(false);
        }
      } else if (!isAuthenticated) {
        loadedFromCloudRef.current = false;
        setIsLoadingFromCloud(false);
        clearSettingsCookie();
        clearSettingsStorage();
      }
    });

    return unsubscribe;
  }, []);

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

  // Convert database settings to our Settings interface
  // const settings: Settings | null = dbSettings ? {
  //   theme: dbSettings.theme,
  //   fontSize: dbSettings.fontSize,
  //   fontFamily: dbSettings.fontFamily,
  //   ttsSpeed: dbSettings.ttsSpeed,
  //   jlptEnabled: dbSettings.jlptEnabled,
  //   autoTranslate: dbSettings.autoTranslate,
  //   targetLanguage: dbSettings.targetLanguage,
  //   customCss: 'customCss' in dbSettings ? dbSettings.customCss : undefined,
  //   showPopupOnHover: 'showPopupOnHover' in dbSettings ? dbSettings.showPopupOnHover : undefined,
  //   touchscreenSupport: 'touchscreenSupport' in dbSettings ? dbSettings.touchscreenSupport : undefined,
  //   disableFadeAnimation: 'disableFadeAnimation' in dbSettings ? dbSettings.disableFadeAnimation : undefined,
  // } : null;
  const settings = currentSettings; // Use state directly

  const updateSettings = (updates: Partial<Settings>) => {
    console.log("Updating settings:", updates);

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
        console.log('🔔 Synced showPopupOnHover to localStorage:', updated.showPopupOnHover);
      }
      if ('touchscreenSupport' in updates) {
        localStorage.setItem('touchscreenSupport', String(updated.touchscreenSupport));
        console.log('🔔 Synced touchscreenSupport to localStorage:', updated.touchscreenSupport);
      }
      if ('disableFadeAnimation' in updates) {
        localStorage.setItem('disableFadeAnimation', String(updated.disableFadeAnimation));
        console.log('🔔 Synced disableFadeAnimation to localStorage:', updated.disableFadeAnimation);
      }
      if ('cacheTranslations' in updates) {
        localStorage.setItem('cacheTranslations', String(updated.cacheTranslations));
      }
      if ('hideFurigana' in updates) {
        localStorage.setItem('hideFurigana', String(updated.hideFurigana));
        console.log('🔔 Synced hideFurigana to localStorage:', updated.hideFurigana);
      }



      // Auto-save to cloud with debouncing
      if (isAuthenticated && loadedFromCloudRef.current) {
        // Clear any existing timeout
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }

        // Set a new timeout to save after 2 seconds of no changes
        autoSaveTimeoutRef.current = setTimeout(async () => {
          try {
            console.log('🔄 Auto-saving settings to cloud...');

            // First, load existing comprehensive settings to preserve API keys and other fields
            const existingSettingsRaw = await loadSettings();
            const existingSettings = (existingSettingsRaw && typeof existingSettingsRaw === 'object') ? existingSettingsRaw : {};
            console.log('🔍 [SettingsContext] Existing settings loaded for merge:', existingSettings);

            // Merge the basic settings with existing comprehensive settings
            const preserved = { ...existingSettings } as any;
            // Ensure JPDB API key is preserved from cookies if not yet saved in cloud
            if (!preserved.jpdb_api_key) {
              try {
                const m1 = document.cookie.match(/(?:^|;\s*)jpdbApiKey=([^;]+)/);
                const m2 = document.cookie.match(/(?:^|;\s*)jpdb_api_key=([^;]+)/);
                const cookieKey = m1?.[1] || m2?.[1];
                if (cookieKey) preserved.jpdb_api_key = cookieKey;
              } catch { }
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
              mix_enabled: updated.mixEnabled,
              mix_aggression: updated.mixAggression,
              mix_auto_enable_highlight: updated.mixAutoEnableHighlight,
              mix_backup_mirror_to_drive: updated.mixBackupMirrorToDrive,
              mix_mirror_stale_after_hours: updated.mixMirrorStaleAfterHours,
              // Add timestamp and version
              lastUpdated: new Date().toISOString(),
              version: '1.0'
            };

            console.log('🔍 [SettingsContext] Auto-saving merged settings:', settingsToSave);
            const success = await saveSettings(settingsToSave);
            if (success) {
              console.log('✅ Settings auto-saved to cloud successfully (comprehensive format preserved)');
            } else {
              console.warn('⚠️ Auto-save to cloud failed');
            }
          } catch (error) {
            console.error('❌ Error auto-saving settings:', error);
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
        ruby rt {
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

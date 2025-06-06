import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useStorageService } from "../hooks/useStorageService";
import { gDriveService } from "../services/gdriveService";

type Theme = "light" | "dark" | "system";

interface Settings {
  theme: Theme;
  fontSize: number;
  fontFamily: string;
  ttsSpeed: number;
  jlptEnabled: boolean;
  autoTranslate: boolean;
  targetLanguage: string;
  customCss?: string;
  showPopupOnHover?: boolean;
  touchscreenSupport?: boolean;
  disableFadeAnimation?: boolean;
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
  customCss: "",
  showPopupOnHover: true,
  touchscreenSupport: true,
  disableFadeAnimation: false,
};

const SETTINGS_COOKIE = "prSettings";

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
  const [current_settings, set_current_settings] = useState<Settings>(defaultSettings);
  const { isAuthenticated, loadSettings } = useStorageService();
  const loaded_from_cloud_ref = useRef(false);

  // Load settings from cookie on initial mount
  useEffect(() => {
    const cookieSettings = getSettingsCookie();
    if (cookieSettings) {
      set_current_settings(prev => ({ ...prev, ...cookieSettings }));
    }
  }, []);

  // Load settings from cloud after authentication and when Drive connects
  useEffect(() => {
    const attemptCloudLoad = async () => {
      if (!isAuthenticated || loaded_from_cloud_ref.current || !gDriveService.isSignedIn()) {
        return;
      }

      try {
        const data = await loadSettings();
        if (data) {
          set_current_settings(prev => {
            const updated = { ...prev, ...data };
            setSettingsCookie(updated);
            return updated;
          });
        }
        loaded_from_cloud_ref.current = true;
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };

    attemptCloudLoad();
    const unsubscribe = gDriveService.listenToSigninStatus(() => {
      attemptCloudLoad();
    });

    if (!isAuthenticated) {
      loaded_from_cloud_ref.current = false;
      clearSettingsCookie();
    }

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, loadSettings]);

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
  const settings = current_settings; // Use state directly

  const updateSettings = (updates: Partial<Settings>) => {
    console.log("Update settings (TODO - Flask API call):", updates);
    set_current_settings(prev => {
      const updated = { ...prev, ...updates };
      setSettingsCookie(updated);
      return updated;
    });
  };

    // Apply theme to document
    useEffect(() => {
        if (!settings) return;

        const root = document.documentElement;
        root.classList.remove('user-theme-light', 'user-theme-dark', 'dark');

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
        } else if (settings.theme === 'dark') {
            root.classList.add('user-theme-dark');
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

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useStorageService } from "../hooks/useStorageService";

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
  cacheTranslations?: boolean;
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
  cacheTranslations: true,
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
  const { isAuthenticated, loadSettings, books } = useStorageService();
  const loadedFromCloudRef = useRef(false);

  // Load settings from localStorage or cookie on initial mount
  useEffect(() => {
    const stored = getSettingsStorage() || getSettingsCookie();
    if (stored) {
      setCurrentSettings(prev => {
        const updated = { ...prev, ...stored };
        
        // Sync accessibility settings to localStorage for JPDB integration
        localStorage.setItem('showPopupOnHover', String(updated.showPopupOnHover));
        localStorage.setItem('touchscreenSupport', String(updated.touchscreenSupport));
        localStorage.setItem('disableFadeAnimation', String(updated.disableFadeAnimation));
        localStorage.setItem('cacheTranslations', String(updated.cacheTranslations));
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
      console.log('🔔 Initial sync of default accessibility settings to localStorage');
      setSettingsStorage(defaultSettings);
    }
  }, []);

  // Load settings from Clerk after authentication
  useEffect(() => {
    const attemptCloudLoad = async () => {
      if (!isAuthenticated || loadedFromCloudRef.current) {
        return;
      }

      try {
        const data = await loadSettings();
        if (data) {
          setCurrentSettings(prev => {
            const updated = { ...prev, ...data };
            setSettingsCookie(updated);
            setSettingsStorage(updated);
            return updated;
          });
        }
        loadedFromCloudRef.current = true;
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };

    attemptCloudLoad();

    if (!isAuthenticated) {
      loadedFromCloudRef.current = false;
      clearSettingsCookie();
      clearSettingsStorage();
    }

    return () => {};
  }, [isAuthenticated, loadSettings, books.length]);

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
    console.log("Update settings (TODO - Flask API call):", updates);
    setCurrentSettings(prev => {
      const updated = { ...prev, ...updates };
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

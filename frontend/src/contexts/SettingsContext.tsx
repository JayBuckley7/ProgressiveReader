import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAppData } from "./AppDataContext";
import { authManager } from "../services/authManager";
import { storageService } from "../services/storageService";
import { toast } from "sonner";

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
  useOfflineParser?: boolean;
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
  useOfflineParser: false,
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
        
        // Sync accessibility settings to localStorage for JPDB integration
        localStorage.setItem('showPopupOnHover', String(updated.showPopupOnHover));
        localStorage.setItem('touchscreenSupport', String(updated.touchscreenSupport));
        localStorage.setItem('disableFadeAnimation', String(updated.disableFadeAnimation));
        localStorage.setItem('cacheTranslations', String(updated.cacheTranslations));
        localStorage.setItem('useOfflineParser', String(updated.useOfflineParser));
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
      localStorage.setItem('useOfflineParser', String(defaultSettings.useOfflineParser));
      console.log('🔔 Initial sync of default accessibility settings to localStorage');
      setSettingsStorage(defaultSettings);
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
          const data = await storageService.loadSettings();
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
              if (data.showPopupOnHover !== undefined) basicSettingsUpdates.showPopupOnHover = data.showPopupOnHover;
              if (data.touchscreenSupport !== undefined) basicSettingsUpdates.touchscreenSupport = data.touchscreenSupport;
              if (data.disableFadeAnimation !== undefined) basicSettingsUpdates.disableFadeAnimation = data.disableFadeAnimation;
              
              const updated = { ...prev, ...basicSettingsUpdates };
              setSettingsCookie(updated);
              setSettingsStorage(updated);
              
              // Sync accessibility settings to localStorage for JPDB integration
              localStorage.setItem('showPopupOnHover', String(updated.showPopupOnHover));
              localStorage.setItem('touchscreenSupport', String(updated.touchscreenSupport));
              localStorage.setItem('disableFadeAnimation', String(updated.disableFadeAnimation));
              localStorage.setItem('cacheTranslations', String(updated.cacheTranslations));
              console.log('🔔 Auto-synced all accessibility settings to localStorage');
              
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
      if ('useOfflineParser' in updates) {
        localStorage.setItem('useOfflineParser', String(updated.useOfflineParser));
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
            const existingSettings = await loadSettings();
            console.log('🔍 [SettingsContext] Existing settings loaded for merge:', existingSettings);
            
            // Merge the basic settings with existing comprehensive settings
            const settingsToSave = {
              ...existingSettings, // Preserve existing comprehensive settings
              // Map basic settings to the expected comprehensive format
              userTheme: updated.theme,
              fontSize: String(updated.fontSize),
              target_language: updated.targetLanguage,
              showPopupOnHover: updated.showPopupOnHover,
              touchscreenSupport: updated.touchscreenSupport,
              disableFadeAnimation: updated.disableFadeAnimation,
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

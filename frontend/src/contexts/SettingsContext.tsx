import React, { createContext, useContext, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

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
}

interface SettingsContextType {
  settings: Settings | null;
  updateSettings: (updates: Partial<Settings>) => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const dbSettings = useQuery(api.settings.get);
  const updateSettingsMutation = useMutation(api.settings.update);

  // Convert database settings to our Settings interface
  const settings: Settings | null = dbSettings ? {
    theme: dbSettings.theme,
    fontSize: dbSettings.fontSize,
    fontFamily: dbSettings.fontFamily,
    ttsSpeed: dbSettings.ttsSpeed,
    jlptEnabled: dbSettings.jlptEnabled,
    autoTranslate: dbSettings.autoTranslate,
    targetLanguage: dbSettings.targetLanguage,
    customCss: 'customCss' in dbSettings ? dbSettings.customCss : undefined,
  } : null;

  const updateSettings = (updates: Partial<Settings>) => {
    updateSettingsMutation(updates);
  };

  // Apply theme to document
  useEffect(() => {
    if (!settings) return;

    const root = document.documentElement;
    root.classList.remove('user-theme-light', 'user-theme-dark');
    
    if (settings.theme === 'light') {
      root.classList.add('user-theme-light');
    } else if (settings.theme === 'dark') {
      root.classList.add('user-theme-dark');
    }
    // For 'system', let CSS handle it with prefers-color-scheme
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
      isLoading: dbSettings === undefined,
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

import { useSettings } from "../contexts/SettingsContext";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAppData } from "../contexts/AppDataContext";

// LocalStorage & Cookie keys
const localKeys = {
  openaiKey: "openaiKey",
  useServerKey: "useServerKey",
  openaiModel: "openaiModel",
  cefrLevel: "cefrLevel",
  autoload: "autoloadTranslations",
  jpdbDeckId: "jpdbMiningDeckId", // Changed to match JPDB integration expectation
  forqDeckId: "forqDeckId",
  blacklistDeckId: "blacklistDeckId",
  neverForgetDeckId: "neverForgetDeckId",
  contextSentenceCount: "contextWidth", // Changed to match JPDB integration expectation
  autoAddToFORQ: "forqOnMine", // Changed to match JPDB integration expectation
  preferDueCards: "preferDueCards",
  customWordCSS: "customWordCSS",
  customPopupCSS: "customPopupCSS",

};

const cookieKeys = {
  jpdbApiKey: "jpdbApiKey",
};

// Tab configuration with icons
const tabs = [
  { id: "general", label: "General", icon: "⚙️" },
  { id: "highlight", label: "Highlighter", icon: "🎌" },
  { id: "accessibility", label: "Accessibility", icon: "♿" },
] as const;

export function SettingsModal({ onClose, onTranslate, translating }: {
    onClose: () => void;
    onTranslate: (useCefr: boolean) => void;
    translating: boolean;
}) {
    const { settings, updateSettings } = useSettings();
    const { saveSettings, loadSettings, isAuthenticated } = useAppData();
  const [activeTab, setActiveTab] = useState<"general" | "highlight" | "accessibility">("general");
    const [isCloudLoading, setIsCloudLoading] = useState(false);
    const [serverKeyAvailable, setServerKeyAvailable] = useState<boolean | null>(null);
    const [isApiConfigExpanded, setIsApiConfigExpanded] = useState(false);

  const [localState, setLocalState] = useState(() => ({
    openaiKey: localStorage.getItem(localKeys.openaiKey) || "",
    useServerKey: localStorage.getItem(localKeys.useServerKey) !== "false",
    openaiModel: localStorage.getItem(localKeys.openaiModel) || "gpt-4o-mini",
    cefrLevel: parseInt(localStorage.getItem(localKeys.cefrLevel) || "3"),
    autoload: localStorage.getItem(localKeys.autoload) === "true",
    jpdbDeckId: localStorage.getItem(localKeys.jpdbDeckId) || "",
    forqDeckId: localStorage.getItem(localKeys.forqDeckId) || "",
    blacklistDeckId: localStorage.getItem(localKeys.blacklistDeckId) || "",
    neverForgetDeckId: localStorage.getItem(localKeys.neverForgetDeckId) || "",
    contextSentenceCount: parseInt(localStorage.getItem(localKeys.contextSentenceCount) || "1"),
    autoAddToFORQ: localStorage.getItem(localKeys.autoAddToFORQ) === "true",
    preferDueCards: localStorage.getItem(localKeys.preferDueCards) === "true",
    customWordCSS: localStorage.getItem(localKeys.customWordCSS) || "",
    customPopupCSS: localStorage.getItem(localKeys.customPopupCSS) || "",
  }));

  const [jpdbApiKey, setJpdbApiKey] = useState(() => document.cookie.match(/jpdbApiKey=([^;]+)/)?.[1] || "");
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Store all local settings to localStorage using the mapped keys
    Object.entries(localKeys).forEach(([key, storageKey]) => {
      const value = localState[key as keyof typeof localState];
      localStorage.setItem(storageKey, typeof value === "boolean" ? value.toString() : String(value));
    });
    
    // Store JPDB API key in both cookie formats for compatibility
    if (jpdbApiKey) {
      document.cookie = `jpdbApiKey=${jpdbApiKey}; path=/;`;
      document.cookie = `jpdb_api_key=${jpdbApiKey}; path=/;`;
    }
    
    console.log('🔔 Synced all settings to localStorage and cookies');
  }, [localState, jpdbApiKey]);

  useEffect(() => {
    fetch('/api/openai_key_configured')
      .then(res => res.json())
      .then(data => setServerKeyAvailable(data.openai_key_configured))
      .catch(() => setServerKeyAvailable(false));
  }, []);

  // Ensure a parser is always active - default to Google Translate when no
  // JPDB API key is configured and JPDB parser is selected
  useEffect(() => {
    if (!jpdbApiKey && !settings.useOfflineParser) {
      updateSettings({ useOfflineParser: true });
    }
  }, [jpdbApiKey, settings.useOfflineParser]);



    if (!settings) return null;

  const handleChange = <K extends keyof typeof localState>(key: K, value: typeof localState[K]) => {
    setLocalState(prev => ({ ...prev, [key]: value }));
  };

  // Helper function to create settings object for export/cloud save
  const createSettingsObject = () => ({
    // API and model settings
    openai_api_key: localState.openaiKey,
    use_server_key: localState.useServerKey,
    jpdb_api_key: jpdbApiKey,
    openai_model: localState.openaiModel,
    target_language: settings.targetLanguage,
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
    
    // Keybind settings - for now just store as "None" to match format
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
    useOfflineParser: settings.useOfflineParser ?? false,
    customPopupCSS: localState.customPopupCSS,
  });

  // Helper function to apply imported settings
  const applyImportedSettings = (importedSettings: any) => {
    // Update local state with imported values
    const newLocalState = {
      ...localState,
      openaiKey: importedSettings.openai_api_key ?? localState.openaiKey,
      useServerKey: importedSettings.use_server_key ?? localState.useServerKey,
      openaiModel: importedSettings.openai_model ?? localState.openaiModel,
      cefrLevel: parseInt(importedSettings.cefr_index ?? String(localState.cefrLevel)),
      autoload: importedSettings.autoload_preference ?? localState.autoload,
      jpdbDeckId: importedSettings.jpdbMiningDeckId ?? localState.jpdbDeckId,
      forqDeckId: importedSettings.forqDeckId ?? localState.forqDeckId,
      blacklistDeckId: importedSettings.blacklistDeckId ?? localState.blacklistDeckId,
      neverForgetDeckId: importedSettings.neverForgetDeckId ?? localState.neverForgetDeckId,
      contextSentenceCount: parseInt(importedSettings.contextWidth ?? String(localState.contextSentenceCount)) || 1,
      autoAddToFORQ: importedSettings.forqOnMine ?? localState.autoAddToFORQ,
      preferDueCards: importedSettings.prefer_due_cards ?? localState.preferDueCards,
      customWordCSS: importedSettings.customWordCSS ?? localState.customWordCSS,
      customPopupCSS: importedSettings.customPopupCSS ?? localState.customPopupCSS,
    };
    
    setLocalState(newLocalState);
    
    // Update jpdbApiKey if present
    if (importedSettings.jpdb_api_key !== undefined) {
      setJpdbApiKey(importedSettings.jpdb_api_key);
    }
    
    // Update settings through context
    const settingsUpdates: any = {};
    if (importedSettings.target_language !== undefined) settingsUpdates.targetLanguage = importedSettings.target_language;
    if (importedSettings.userTheme !== undefined) settingsUpdates.theme = importedSettings.userTheme;
    if (importedSettings.fontSize !== undefined) settingsUpdates.fontSize = parseInt(importedSettings.fontSize) || 16;
    if (importedSettings.showPopupOnHover !== undefined) settingsUpdates.showPopupOnHover = importedSettings.showPopupOnHover;
    if (importedSettings.touchscreenSupport !== undefined) settingsUpdates.touchscreenSupport = importedSettings.touchscreenSupport;
    if (importedSettings.disableFadeAnimation !== undefined) settingsUpdates.disableFadeAnimation = importedSettings.disableFadeAnimation;
    if (importedSettings.useOfflineParser !== undefined) settingsUpdates.useOfflineParser = importedSettings.useOfflineParser;
    
    if (Object.keys(settingsUpdates).length > 0) {
      updateSettings(settingsUpdates);
    }
  };

  // Manual cloud save functionality (force save current state)
  const handleCloudSave = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to save settings to cloud storage');
      return;
    }
    
    setIsCloudLoading(true);
    try {
      const settingsToSave = createSettingsObject();
      console.log('🔍 [SettingsModal] Saving comprehensive settings to Google Drive:', settingsToSave);
      const success = await saveSettings(settingsToSave);
      if (success) {
        toast.success('Settings manually saved to Google Drive successfully!');
      } else {
        toast.error('Failed to save settings to Google Drive');
      }
    } catch (error) {
      console.error('Cloud save error:', error);
      toast.error('Error saving settings to Google Drive');
    } finally {
      setIsCloudLoading(false);
    }
  };

  // Manual cloud load functionality (overwrite current settings)
  const handleCloudLoad = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to load settings from cloud storage');
      return;
    }
    
    setIsCloudLoading(true);
    try {
      const cloudSettings = await loadSettings();
      console.log('🔍 [SettingsModal] Loaded settings from Google Drive:', cloudSettings);
      if (cloudSettings && Object.keys(cloudSettings).length > 0) {
        applyImportedSettings(cloudSettings);
        toast.success('Settings loaded from Google Drive successfully!');
      } else {
        toast.info('No settings.json file found in Google Drive');
      }
    } catch (error: any) {
      if (error.message !== 'UNAUTHORIZED') {
        console.error('Cloud load error:', error);
        toast.error('Failed to load settings from Google Drive');
      }
    } finally {
      setIsCloudLoading(false);
    }
  };



    return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[calc(100vw-1rem)] sm:max-w-xl md:max-w-2xl max-h-[calc(100vh-1rem)] sm:max-h-[90vh] overflow-hidden animate-slide-up flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-3 sm:p-4 md:p-6 flex-shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">Settings</h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors duration-200 hover:rotate-90 transform p-1"
            >
              <svg className="w-5 sm:w-6 h-5 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    </div>

        {/* Tab Navigation */}
        <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex gap-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`
                  flex items-center gap-1 sm:gap-1.5 md:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 
                  rounded-lg font-medium text-xs sm:text-sm whitespace-nowrap
                  transition-all duration-200 transform flex-shrink-0
                  ${activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-md scale-105'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
                  }
                `}
                onClick={() => setActiveTab(tab.id as any)}
              >
                <span className="text-sm sm:text-base md:text-lg">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
                            </div>
                            </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {activeTab === "general" && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <button
                  onClick={() => setIsApiConfigExpanded(!isApiConfigExpanded)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">🔑 API Configuration</h3>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Optional: Bring your own OpenAI API key for unlimited translations
                    </p>
                  </div>
                  <svg 
                    className={`w-5 h-5 text-blue-600 dark:text-blue-400 transform transition-transform ${isApiConfigExpanded ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {isApiConfigExpanded && (
                  <div className="px-4 pb-4 border-t border-blue-200 dark:border-blue-700">
                    <div className="pt-4 space-y-4">
                      <div className="bg-blue-100 dark:bg-blue-800/40 rounded-lg p-3">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          <strong>💡 Note:</strong> The server provides free translations with shared API keys. 
                          You can add your own OpenAI API key here for unlimited personal usage and faster responses.
                        </p>
                      </div>
                      
                      <TextInput
                        label="OpenAI API Key (Optional)"
                        value={localState.openaiKey}
                        onChange={v => handleChange("openaiKey", v)}
                        placeholder="sk-... (leave empty to use server key)"
                        type="password"
                      />
                      
                      <CheckboxInput
                        label="Use Server Key as Fallback"
                        description="Automatically use server key when your personal key fails or is empty"
                        checked={localState.useServerKey}
                        onChange={v => handleChange("useServerKey", v)}
                      />
                      
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          <strong>Server Key Status:</strong>
                          {serverKeyAvailable === null ? (
                            <span className="font-semibold text-gray-500"> Checking...</span>
                          ) : serverKeyAvailable ? (
                            <span className="font-semibold text-green-600 dark:text-green-400"> ✓ Available</span>
                          ) : (
                            <span className="font-semibold text-red-600 dark:text-red-400"> ✗ Not Available</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectInput
                  label="Theme"
                  value={settings.theme}
                  onChange={v => updateSettings({ theme: v as any })}
                  options={[
                    { value: "system", label: "🌓 System Default" },
                    { value: "light", label: "☀️ Light" },
                    { value: "dark", label: "🌙 Dark" }
                  ]}
                />
                <SelectInput
                  label="Preferred Model"
                  value={localState.openaiModel}
                  onChange={v => handleChange("openaiModel", v)}
                  options={[
                    { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast)" },
                    { value: "gpt-4", label: "GPT-4 (Powerful)" },
                    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Legacy)" }
                  ]}
                />
                            </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectInput
                  label="Target Language"
                  value={settings.targetLanguage}
                  onChange={v => updateSettings({ targetLanguage: v })}
                  options={[
                    { value: "English", label: "🇬🇧 English" },
                    { value: "Japanese", label: "🇯🇵 Japanese" }
                  ]}
                />
                <SelectInput
                  label="Target CEFR Level"
                  value={String(localState.cefrLevel)}
                  onChange={v => handleChange("cefrLevel", parseInt(v))}
                  options={[
                    { value: "0", label: "A1 (Beginner)" },
                    { value: "1", label: "A2 (Elementary)" },
                    { value: "2", label: "B1 (Intermediate)" },
                    { value: "3", label: "B2 (Upper Intermediate)" },
                    { value: "4", label: "C1 (Advanced)" },
                    { value: "5", label: "C2 (Proficient)" }
                  ]}
                />
                            </div>

              <CheckboxInput
                label="Autoload Translations"
                description="Automatically load translations when opening a book"
                checked={localState.autoload}
                onChange={v => handleChange("autoload", v)}
              />

              <CheckboxInput
                label="Cache Translations"
                description="Store last translation per chapter for offline use"
                checked={settings.cacheTranslations ?? true}
                onChange={v => updateSettings({ cacheTranslations: v })}
              />



              <SliderInput
                label="Font Size"
                value={settings.fontSize}
                onChange={v => updateSettings({ fontSize: v })}
                min={12}
                max={24}
                unit="px"
              />
            </div>
          )}

          {activeTab === "highlight" && (
            <div className="space-y-6 animate-fade-in">
              {/* Parser toggle */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Parser
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="parser"
                      value="google"
                      checked={settings.useOfflineParser}
                      onChange={() => updateSettings({ useOfflineParser: true })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">Google Translate</span>
                  </label>
                  <label
                    className={`flex items-center gap-2 cursor-pointer ${!jpdbApiKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="radio"
                      name="parser"
                      value="jpdb"
                      checked={!settings.useOfflineParser}
                      onChange={() => updateSettings({ useOfflineParser: false })}
                      disabled={!jpdbApiKey}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm">JPDB</span>
                  </label>
                </div>
                {!jpdbApiKey && (
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    Enter a JPDB API key below to enable JPDB parsing.
                  </p>
                )}
              </div>

              {/* JPDB API key visible when JPDB parser selected or key missing */}
              {(!settings.useOfflineParser || !jpdbApiKey) && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-2">JPDB API Key</h3>
                  <TextInput
                    label="JPDB API Key"
                    value={jpdbApiKey}
                    onChange={setJpdbApiKey}
                    placeholder="Enter your JPDB API key"
                    type="password"
                  />
                </div>
              )}

              {!settings.useOfflineParser && jpdbApiKey && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextInput
                      label="Mining Deck ID"
                      value={localState.jpdbDeckId}
                      onChange={v => handleChange('jpdbDeckId', v)}
                      placeholder="e.g., 12345"
                    />
                    <TextInput
                      label="FORQ Deck ID"
                      value={localState.forqDeckId}
                      onChange={v => handleChange('forqDeckId', v)}
                      placeholder="e.g., 67890"
                    />
                    <TextInput
                      label="Blacklist Deck ID"
                      value={localState.blacklistDeckId}
                      onChange={v => handleChange('blacklistDeckId', v)}
                      placeholder="e.g., 11111"
                    />
                    <TextInput
                      label="Never Forget Deck ID"
                      value={localState.neverForgetDeckId}
                      onChange={v => handleChange('neverForgetDeckId', v)}
                      placeholder="e.g., 22222"
                    />
                  </div>

                  <TextInput
                    label="Context Sentences"
                    type="number"
                    value={String(localState.contextSentenceCount)}
                    onChange={v => handleChange('contextSentenceCount', parseInt(v) || 1)}
                    min="1"
                    max="5"
                  />

                  <div className="space-y-3">
                    <CheckboxInput
                      label="Add to FORQ When Mining"
                      description="Automatically add mined cards to your FORQ deck"
                      checked={localState.autoAddToFORQ}
                      onChange={v => handleChange('autoAddToFORQ', v)}
                    />
                    <CheckboxInput
                      label="Prefer Due Cards"
                      description="Prioritize due cards in translation suggestions"
                      checked={localState.preferDueCards}
                      onChange={v => handleChange('preferDueCards', v)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "accessibility" && (
            <div className="space-y-6 animate-fade-in">
              <div className="space-y-3">
                <CheckboxInput
                  label="Show Popup on Hover"
                  description="Display word information when hovering"
                  checked={settings.showPopupOnHover ?? true}
                  onChange={v => updateSettings({ showPopupOnHover: v })}
                />
                <CheckboxInput
                  label="Touchscreen Support"
                  description="Enable touch interactions for mobile devices"
                  checked={settings.touchscreenSupport ?? false}
                  onChange={v => updateSettings({ touchscreenSupport: v })}
                />
                <CheckboxInput
                  label="Disable Fade Animation"
                  description="Remove fade effects for better performance"
                  checked={settings.disableFadeAnimation ?? false}
                  onChange={v => updateSettings({ disableFadeAnimation: v })}
                />
              </div>

                        <div className="space-y-4">
                <TextInput
                  label="Custom Word CSS"
                  value={localState.customWordCSS}
                  onChange={v => handleChange("customWordCSS", v)}
                  multiline
                  placeholder=".word { color: blue; }"
                />
                <TextInput
                  label="Custom Popup CSS"
                  value={localState.customPopupCSS}
                  onChange={v => handleChange("customPopupCSS", v)}
                  multiline
                  placeholder=".popup { background: white; }"
                />
              </div>

              {/* Auto-save Info */}
              {isAuthenticated && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-600 dark:text-blue-400">🔄</span>
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Cloud Sync Active</span>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Settings automatically load from Google Drive when you sign in and save when changed.
                    Manual buttons below can force sync if needed.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {/* Cloud Storage Buttons */}
                {isAuthenticated && (
                  <>
                    <button
                      onClick={handleCloudSave}
                      disabled={isCloudLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCloudLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <span>☁️</span>
                          Force Save Now
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCloudLoad}
                      disabled={isCloudLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCloudLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          <span>📥</span>
                          Reload from Cloud
                        </>
                      )}
                    </button>
                  </>
                )}
                
                {/* File Export/Import Buttons */}
                <button
                  onClick={() => {
                    // Export all settings to JSON file using the helper function
                    const settingsToExport = createSettingsObject();
                    
                    const jsonString = JSON.stringify(settingsToExport, null, 2);
                    const blob = new Blob([jsonString], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `progressive_reader_settings_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    // Show success message
                    toast.success('Settings exported successfully!');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
                >
                  <span>📋</span>
                  Export to File
                </button>
                <button
                  onClick={() => {
                    // Create file input element
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          try {
                            const importedSettings = JSON.parse(event.target?.result as string);
                            
                            // Use the helper function to apply imported settings
                            applyImportedSettings(importedSettings);
                            
                            // Show success message
                            toast.success('Settings imported from file successfully!');
                            
                            // Optional: Force a page reload to ensure all settings are applied
                            // window.location.reload();
                          } catch (error) {
                            console.error('Error importing settings:', error);
                            toast.error('Failed to import settings. Please check the file format.');
                          }
                        };
                        reader.readAsText(file);
                      }
                    };
                    input.click();
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
                >
                  <span>📁</span>
                  Import from File
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 md:p-6 flex-shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex flex-row gap-2 sm:gap-3">
              <button
                onClick={() => onTranslate(false)}
                disabled={translating}
                className="
                  flex-1 sm:flex-initial px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 
                  bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium 
                  rounded-lg text-xs sm:text-sm md:text-base whitespace-nowrap
                  hover:from-blue-600 hover:to-blue-700 focus:ring-4 focus:ring-blue-500/30
                  disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                  transform hover:scale-105 active:scale-95
                "
              >
                {translating ? (
                  <span className="flex items-center justify-center gap-1 sm:gap-2">
                    <svg className="animate-spin h-3 w-3 sm:h-4 sm:w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="hidden sm:inline">Translating...</span>
                    <span className="sm:hidden">...</span>
                  </span>
                ) : 'Translate'}
              </button>
              <button
                onClick={() => onTranslate(true)}
                disabled={translating}
                className="
                  flex-1 sm:flex-initial px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 
                  bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium 
                  rounded-lg text-xs sm:text-sm md:text-base whitespace-nowrap
                  hover:from-purple-600 hover:to-purple-700 focus:ring-4 focus:ring-purple-500/30
                  disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                  transform hover:scale-105 active:scale-95
                "
              >
                {translating ? (
                  <span className="flex items-center justify-center gap-1 sm:gap-2">
                    <svg className="animate-spin h-3 w-3 sm:h-4 sm:w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="hidden sm:inline">Translating...</span>
                    <span className="sm:hidden">...</span>
                  </span>
                ) : <span className="hidden sm:inline">Translate (CEFR)</span>}
                {!translating && <span className="sm:hidden">CEFR</span>}
              </button>
            </div>
            <button
              onClick={onClose}
              className="
                px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 
                bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                font-medium rounded-lg text-xs sm:text-sm md:text-base
                hover:bg-gray-300 dark:hover:bg-gray-600 focus:ring-4 focus:ring-gray-500/30
                transition-all duration-200 transform hover:scale-105 active:scale-95
              "
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Enhanced Reusable Input Components

function TextInput({ 
  label, 
  value, 
  onChange, 
  type = "text", 
  multiline = false, 
  placeholder = "",
  min,
  max
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  const inputClasses = `
    w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
    bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
    placeholder-gray-400 dark:placeholder-gray-500
    focus:ring-2 focus:ring-blue-500 focus:border-transparent
    transition-all duration-200
  `;

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {multiline ? (
        <textarea
          className={`${inputClasses} min-h-[100px] resize-y`}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className={inputClasses}
          value={value}
          type={type}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
        />
      )}
    </div>
  );
}

function SelectInput({ 
  label, 
  value, 
  onChange, 
  options 
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string } | string>;
}) {
  const normalizedOptions = options.map(opt => 
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <select
        className="
          w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
          focus:ring-2 focus:ring-blue-500 focus:border-transparent
          transition-all duration-200 cursor-pointer
        "
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {normalizedOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function SliderInput({ 
  label, 
  value, 
  onChange, 
  min, 
  max,
  unit = ""
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <span className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="
          w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer
          slider:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        "
      />
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function CheckboxInput({ 
  label, 
  checked, 
  onChange,
  description
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-200 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="
          mt-0.5 w-5 h-5 text-blue-600 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600
          rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-0
          transition-all duration-200 cursor-pointer
        "
      />
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
        </div>
        {description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {description}
          </div>
        )}
      </div>
    </label>
    );
}

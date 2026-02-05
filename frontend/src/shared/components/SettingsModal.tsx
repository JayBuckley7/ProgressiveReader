import { useSettings } from "@shared/contexts/SettingsContext";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAppData } from "@shared/contexts/AppDataContext";
import { useTranslation } from "react-i18next";

// LocalStorage & Cookie keys
const localKeys = {
  openaiKey: "openaiKey",
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

const tabs = [
  { id: "general" },
  { id: "highlight" },
  { id: "accessibility" },
] as const;

export function SettingsModal({ onClose, onTranslate, translating }: {
    onClose: () => void;
    onTranslate: (useCefr: boolean) => void;
    translating: boolean;
}) {
	const { settings, updateSettings } = useSettings();
	const { saveSettings, loadSettings, isAuthenticated } = useAppData();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"general" | "highlight" | "accessibility">("general");
	const [isCloudLoading, setIsCloudLoading] = useState(false);
	const [cloudAction, setCloudAction] = useState<"save" | "load" | null>(null);
	const [isApiConfigExpanded, setIsApiConfigExpanded] = useState(false);

  const [localState, setLocalState] = useState(() => ({
    openaiKey: localStorage.getItem(localKeys.openaiKey) || "",
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

  const [jpdbApiKey, setJpdbApiKey] = useState(() => {
    const m1 = document.cookie.match(/(?:^|;\s*)jpdbApiKey=([^;]+)/);
    const m2 = document.cookie.match(/(?:^|;\s*)jpdb_api_key=([^;]+)/);
    return (m1?.[1] || m2?.[1] || "");
  });
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Store all local settings to localStorage using the mapped keys
    Object.entries(localKeys).forEach(([key, storageKey]) => {
      const value = localState[key as keyof typeof localState];
      localStorage.setItem(storageKey, typeof value === "boolean" ? value.toString() : String(value));
    });
    
    // Clean up deprecated settings
    localStorage.removeItem("useServerKey");
    localStorage.removeItem("useOfflineParser");
    
    // Store JPDB API key in both cookie formats for compatibility, or clear if empty
    if (jpdbApiKey) {
      document.cookie = `jpdbApiKey=${jpdbApiKey}; path=/;`;
      document.cookie = `jpdb_api_key=${jpdbApiKey}; path=/;`;
    } else {
      // Clear cookies when key is removed to avoid stale values
      document.cookie = `jpdbApiKey=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
      document.cookie = `jpdb_api_key=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
    }
    
    console.log('Synced all settings to localStorage and cookies');
  }, [localState, jpdbApiKey]);

  // Note: Parser selection is now automatic based on JPDB API key presence



    if (!settings) return null;

  const handleChange = <K extends keyof typeof localState>(key: K, value: typeof localState[K]) => {
    setLocalState(prev => ({ ...prev, [key]: value }));
  };

  // Helper function to create settings object for export/cloud save
  const createSettingsObject = () => ({
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
    hideFurigana: settings.hideFurigana ?? false,
    cacheTranslations: settings.cacheTranslations ?? true,
    customPopupCSS: localState.customPopupCSS,
  });

  // Helper function to apply imported settings
  const applyImportedSettings = (importedSettings: any) => {
    // Update local state with imported values
    const newLocalState = {
      ...localState,
      openaiKey: importedSettings.openai_api_key ?? localState.openaiKey,
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
    if (importedSettings.uiLanguage !== undefined) settingsUpdates.uiLanguage = importedSettings.uiLanguage;
    if (importedSettings.userTheme !== undefined) settingsUpdates.theme = importedSettings.userTheme;
    if (importedSettings.fontSize !== undefined) settingsUpdates.fontSize = parseInt(importedSettings.fontSize) || 16;
    if (importedSettings.showPopupOnHover !== undefined) settingsUpdates.showPopupOnHover = importedSettings.showPopupOnHover;
    if (importedSettings.touchscreenSupport !== undefined) settingsUpdates.touchscreenSupport = importedSettings.touchscreenSupport;
    if (importedSettings.disableFadeAnimation !== undefined) settingsUpdates.disableFadeAnimation = importedSettings.disableFadeAnimation;
    if (importedSettings.hideFurigana !== undefined) settingsUpdates.hideFurigana = importedSettings.hideFurigana;
    if (importedSettings.cacheTranslations !== undefined) settingsUpdates.cacheTranslations = importedSettings.cacheTranslations;
    
    if (Object.keys(settingsUpdates).length > 0) {
      updateSettings(settingsUpdates);
    }
  };

  // Manual cloud save functionality (force save current state)
  const handleCloudSave = async () => {
    if (!isAuthenticated) {
      toast.error(t('settings.toasts.save.signInRequired'));
      return;
	    }
	    
	    setIsCloudLoading(true);
	    setCloudAction("save");
	    try {
	      const settingsToSave = createSettingsObject();
	      console.log('🔍 [SettingsModal] Saving comprehensive settings to Google Drive:', settingsToSave);
	      const success = await saveSettings(settingsToSave);
      if (success) {
        toast.success(t('settings.toasts.save.success'));
      } else {
        toast.error(t('settings.toasts.save.failure'));
      }
	    } catch (error) {
	      console.error('Cloud save error:', error);
	      toast.error(t('settings.toasts.save.failure'));
	    } finally {
	      setIsCloudLoading(false);
	      setCloudAction(null);
	    }
	  };

  // Manual cloud load functionality (overwrite current settings)
  const handleCloudLoad = async () => {
    if (!isAuthenticated) {
      toast.error(t('settings.toasts.load.signInRequired'));
      return;
	    }
	    
	    setIsCloudLoading(true);
	    setCloudAction("load");
	    try {
	      const cloudSettings = await loadSettings();
	      console.log('🔍 [SettingsModal] Loaded settings from Google Drive:', cloudSettings);
	      if (cloudSettings && Object.keys(cloudSettings).length > 0) {
        applyImportedSettings(cloudSettings);
        toast.success(t('settings.toasts.load.success'));
      } else {
        toast.info(t('settings.toasts.load.missing'));
      }
	    } catch (error: any) {
	      if (error.message !== 'UNAUTHORIZED') {
	        console.error('Cloud load error:', error);
	        toast.error(t('settings.toasts.load.failure'));
	      }
	    } finally {
	      setIsCloudLoading(false);
	      setCloudAction(null);
	    }
	  };



    return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
	      <div className="app-card w-full max-w-[calc(100vw-1rem)] sm:max-w-xl md:max-w-2xl max-h-[calc(100vh-1rem)] sm:max-h-[90vh] overflow-hidden flex flex-col">
	        <div className="px-4 sm:px-6 py-4 border-b app-border flex-shrink-0 flex justify-between items-center">
	          <h2 className="text-lg sm:text-xl font-semibold">{t("settings.title")}</h2>
	          <button
	            onClick={onClose}
	            className="text-sm font-medium app-muted hover:text-[var(--ui-text)] transition-colors"
	          >
	            {t("settings.footer.close")}
	          </button>
	        </div>

        {/* Tab Navigation */}
        <div className="border-b app-border flex-shrink-0">
          <div className="flex gap-1 p-2 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors app-nav-item ${
                  activeTab === tab.id ? "app-nav-active" : ""
                }`}
                onClick={() => setActiveTab(tab.id as any)}
              >
                {t(`settings.tabs.${tab.id}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
	          {activeTab === "general" && (
	            <div className="space-y-6 animate-fade-in">
	              <div className="app-card overflow-hidden">
	                <button
	                  onClick={() => setIsApiConfigExpanded(!isApiConfigExpanded)}
	                  aria-expanded={isApiConfigExpanded}
	                  className="w-full flex items-start justify-between gap-4 p-4 text-left hover:bg-[var(--ui-surface-alt)] transition-colors"
	                >
	                  <div>
	                    <h3 className="text-sm font-semibold">{t("settings.general.api.title")}</h3>
	                    <p className="text-xs app-muted mt-1">
	                      {t("settings.general.api.description")}
	                    </p>
	                  </div>
	                  <span className="text-lg leading-none font-medium app-muted select-none">
	                    {isApiConfigExpanded ? "–" : "+"}
	                  </span>
	                </button>
	                
	                {isApiConfigExpanded && (
	                  <div className="px-4 pb-4 border-t app-border">
	                    <div className="pt-4 space-y-3">
	                      <p className="text-xs app-muted leading-relaxed">
	                        {t("settings.general.api.note")}
	                      </p>
	                      <TextInput
	                        label={t("settings.general.api.inputLabel")}
	                        value={localState.openaiKey}
	                        onChange={v => handleChange("openaiKey", v)}
                        placeholder={t("settings.general.api.placeholder")}
                        type="password"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectInput
                  label={t("settings.general.theme.label")}
                  value={settings.theme}
                  onChange={v => updateSettings({ theme: v as any })}
                  options={[
                    { value: "system", label: t("settings.general.theme.options.system") },
                    { value: "light", label: t("settings.general.theme.options.light") },
                    { value: "dark", label: t("settings.general.theme.options.dark") },
                    { value: "wood", label: t("settings.general.theme.options.wood") },
                    { value: "space", label: t("settings.general.theme.options.space") }
                  ]}
                />
                <SelectInput
                  label={t("settings.general.model.label")}
                  value={localState.openaiModel}
                  onChange={v => handleChange("openaiModel", v)}
                  options={[
                    { value: "gpt-4o-mini", label: t("settings.general.model.options.gpt-4o-mini") },
                    { value: "gpt-4", label: t("settings.general.model.options.gpt-4") },
                    { value: "gpt-3.5-turbo", label: t("settings.general.model.options.gpt-3.5-turbo") }
                  ]}
                />
                            </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectInput
                  label={t("settings.general.targetLanguage.label")}
                  value={settings.targetLanguage}
                  onChange={v => updateSettings({ targetLanguage: v })}
                  options={[
                    { value: "English", label: t("settings.general.targetLanguage.options.English") },
                    { value: "Japanese", label: t("settings.general.targetLanguage.options.Japanese") }
                  ]}
                />
                <div className="space-y-1.5">
                  <SelectInput
                    label={t("settings.general.uiLanguage.label")}
                    value={settings.uiLanguage}
                    onChange={v => updateSettings({ uiLanguage: v })}
                    options={[
                      { value: "en", label: t("settings.general.uiLanguage.options.en") },
                      { value: "ja", label: t("settings.general.uiLanguage.options.ja") }
                    ]}
                  />
                  <p className="text-xs app-muted">
                    {t("settings.general.uiLanguage.description")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectInput
                  label={t("settings.general.cefr.label")}
                  value={String(localState.cefrLevel)}
                  onChange={v => handleChange("cefrLevel", parseInt(v))}
                  options={[
                    { value: "0", label: t("settings.general.cefr.options.0") },
                    { value: "1", label: t("settings.general.cefr.options.1") },
                    { value: "2", label: t("settings.general.cefr.options.2") },
                    { value: "3", label: t("settings.general.cefr.options.3") },
                    { value: "4", label: t("settings.general.cefr.options.4") },
                    { value: "5", label: t("settings.general.cefr.options.5") }
                  ]}
                />
              </div>

              <CheckboxInput
                label={t("settings.general.autoload.label")}
                description={t("settings.general.autoload.description")}
                checked={localState.autoload}
                onChange={v => handleChange("autoload", v)}
              />

              <CheckboxInput
                label={t("settings.general.cacheTranslations.label")}
                description={t("settings.general.cacheTranslations.description")}
                checked={settings.cacheTranslations ?? true}
                onChange={v => updateSettings({ cacheTranslations: v })}
              />



              <SliderInput
                label={t("settings.general.fontSize.label")}
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
	              {/* JPDB API key section - always visible */}
	              <div className="app-card p-4">
	                <h3 className="text-sm font-semibold mb-2">{t("settings.highlight.jpdb.title")}</h3>
	                <p className="text-xs app-muted mb-3 leading-relaxed">
	                  {t("settings.highlight.jpdb.description")}
	                  <br />
	                  {t("settings.highlight.jpdb.linkPrefix")}
	                  <a
	                    href="https://jpdb.io/settings#:~:text=in%20the%20future.-,Account%20information,-Username"
	                    target="_blank"
	                    rel="noopener noreferrer"
	                    className="underline underline-offset-4 hover:opacity-90"
	                  >
	                    {t("settings.highlight.jpdb.linkText")}
	                  </a>
	                  {t("settings.highlight.jpdb.linkSuffix")}
	                </p>
                <TextInput
                  label={t("settings.highlight.jpdb.inputLabel")}
                  value={jpdbApiKey}
                  onChange={setJpdbApiKey}
                  placeholder={t("settings.highlight.jpdb.placeholder")}
                  type="text"
                />
              </div>

              {/* Hide Furigana setting - available to all users, not just JPDB users */}
              <CheckboxInput
                label={t("settings.highlight.options.hideFurigana.label")}
                description={t("settings.highlight.options.hideFurigana.description")}
                checked={settings.hideFurigana ?? false}
                onChange={v => updateSettings({ hideFurigana: v })}
              />

              {jpdbApiKey && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextInput
                      label={t("settings.highlight.deck.mining")}
                      value={localState.jpdbDeckId}
                      onChange={v => handleChange('jpdbDeckId', v)}
                      placeholder={t("settings.highlight.deck.placeholder")}
                    />
                    <TextInput
                      label={t("settings.highlight.deck.forq")}
                      value={localState.forqDeckId}
                      onChange={v => handleChange('forqDeckId', v)}
                      placeholder={t("settings.highlight.deck.placeholder")}
                    />
                    <TextInput
                      label={t("settings.highlight.deck.blacklist")}
                      value={localState.blacklistDeckId}
                      onChange={v => handleChange('blacklistDeckId', v)}
                      placeholder={t("settings.highlight.deck.placeholder")}
                    />
                    <TextInput
                      label={t("settings.highlight.deck.neverForget")}
                      value={localState.neverForgetDeckId}
                      onChange={v => handleChange('neverForgetDeckId', v)}
                      placeholder={t("settings.highlight.deck.placeholder")}
                    />
                  </div>

                  <TextInput
                    label={t("settings.highlight.context.label")}
                    type="number"
                    value={String(localState.contextSentenceCount)}
                    onChange={v => handleChange('contextSentenceCount', parseInt(v) || 1)}
                    min="1"
                    max="5"
                  />

                  <div className="space-y-3">
                    <CheckboxInput
                      label={t("settings.highlight.options.autoAdd.label")}
                      description={t("settings.highlight.options.autoAdd.description")}
                      checked={localState.autoAddToFORQ}
                      onChange={v => handleChange('autoAddToFORQ', v)}
                    />
                    <CheckboxInput
                      label={t("settings.highlight.options.preferDueCards.label")}
                      description={t("settings.highlight.options.preferDueCards.description")}
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
                  label={t("settings.accessibility.popup.label")}
                  description={t("settings.accessibility.popup.description")}
                  checked={settings.showPopupOnHover ?? true}
                  onChange={v => updateSettings({ showPopupOnHover: v })}
                />
                <CheckboxInput
                  label={t("settings.accessibility.touchscreen.label")}
                  description={t("settings.accessibility.touchscreen.description")}
                  checked={settings.touchscreenSupport ?? false}
                  onChange={v => updateSettings({ touchscreenSupport: v })}
                />
                <CheckboxInput
                  label={t("settings.accessibility.disableFade.label")}
                  description={t("settings.accessibility.disableFade.description")}
                  checked={settings.disableFadeAnimation ?? false}
                  onChange={v => updateSettings({ disableFadeAnimation: v })}
                />
              </div>

              <div className="space-y-4">
                <TextInput
                  label={t("settings.accessibility.customWordCss.label")}
                  value={localState.customWordCSS}
                  onChange={v => handleChange("customWordCSS", v)}
                  multiline
                  placeholder={t("settings.accessibility.customWordCss.placeholder")}
                />
                <TextInput
                  label={t("settings.accessibility.customPopupCss.label")}
                  value={localState.customPopupCSS}
                  onChange={v => handleChange("customPopupCSS", v)}
                  multiline
                  placeholder={t("settings.accessibility.customPopupCss.placeholder")}
                />
              </div>

	              {/* Auto-save Info */}
	              {isAuthenticated && (
	                <div className="app-card p-3 mb-4">
	                  <div className="text-sm font-medium">{t("settings.accessibility.cloudStatus.title")}</div>
	                  <p className="text-xs app-muted mt-1 leading-relaxed">{t("settings.accessibility.cloudStatus.description")}</p>
	                </div>
	              )}

              <div className="flex flex-wrap gap-3">
                {/* Cloud Storage Buttons */}
                {isAuthenticated && (
                  <>
	                    <button
	                      onClick={handleCloudSave}
	                      disabled={isCloudLoading}
	                      className="px-4 py-2 rounded-md text-sm font-medium app-button-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                      {cloudAction === "save"
	                        ? t("settings.accessibility.buttons.saving")
	                        : t("settings.accessibility.buttons.forceSave")}
	                    </button>
	                    <button
	                      onClick={handleCloudLoad}
	                      disabled={isCloudLoading}
	                      className="px-4 py-2 rounded-md text-sm font-medium app-button-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
	                    >
	                      {cloudAction === "load"
	                        ? t("settings.accessibility.buttons.loading")
	                        : t("settings.accessibility.buttons.reload")}
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
                    toast.success(t('settings.toasts.export.success'));
	                  }}
	                  className="px-4 py-2 rounded-md text-sm font-medium app-button-muted transition-colors"
	                >
	                  {t("settings.accessibility.buttons.export")}
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
                            toast.success(t('settings.toasts.import.success'));
                            
                            // Optional: Force a page reload to ensure all settings are applied
                            // window.location.reload();
                          } catch (error) {
                            console.error('Error importing settings:', error);
                            toast.error(t('settings.toasts.import.failure'));
                          }
                        };
                        reader.readAsText(file);
                      }
                    };
                    input.click();
	                  }}
	                  className="px-4 py-2 rounded-md text-sm font-medium app-button-muted transition-colors"
	                >
	                  {t("settings.accessibility.buttons.import")}
	                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t app-border p-3 sm:p-4 md:p-6 flex-shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex flex-row gap-2 sm:gap-3">
              <button
                onClick={() => onTranslate(false)}
                disabled={translating}
                className="flex-1 sm:flex-initial px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm md:text-base font-medium whitespace-nowrap app-button-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {translating ? t("settings.footer.translating") : t("settings.footer.translate")}
              </button>
              <button
                onClick={() => onTranslate(true)}
                disabled={translating}
                className="flex-1 sm:flex-initial px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm md:text-base font-medium whitespace-nowrap app-button-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {translating ? (
                  t("settings.footer.translating")
                ) : (
                  <>
                    <span className="hidden sm:inline">{t("settings.footer.translateCefr")}</span>
                    <span className="sm:hidden">{t("settings.footer.translateShort")}</span>
                  </>
                )}
              </button>
            </div>
            <button
              onClick={onClose}
              className="px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm md:text-base font-medium app-button-muted transition-colors"
            >
              {t("settings.footer.close")}
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
  return (
    <div className="space-y-1.5">
      <label className="app-form-label">{label}</label>
      {multiline ? (
        <textarea
          className="app-input w-full px-3 py-2 text-sm leading-5 min-h-[110px] resize-y placeholder:opacity-70"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className="app-input w-full px-3 py-2 text-sm leading-5 placeholder:opacity-70"
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
      <label className="app-form-label">{label}</label>
      <select
        className="app-input w-full px-3 py-2 text-sm leading-5 cursor-pointer"
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
        <label className="app-form-label">{label}</label>
        <span className="app-chip font-mono">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="app-range"
      />
      <div className="flex justify-between text-xs app-muted">
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
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="app-checkbox mt-0.5 cursor-pointer"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs app-muted mt-0.5 leading-relaxed">
            {description}
          </div>
        )}
      </div>
    </label>
    );
}

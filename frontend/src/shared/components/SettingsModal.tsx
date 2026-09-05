import { useSettings } from "@shared/contexts/SettingsContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAppData } from "@shared/contexts/AppDataContext";
import { useTranslation } from "react-i18next";
import { appLog } from "@shared/appLog";
import { useGrammar } from "@features/grammar/contexts/GrammarContext";
import { notifyError } from "@shared/utils/notify";
import { SETTINGS_TABS } from "./settingsModal/constants";
import { createSettingsObject, coerceImportedSettings } from "./settingsModal/serialization";
import { readJpdbApiKeyFromCookies, readLocalSettingsState, syncSettingsToStorage } from "./settingsModal/storage";
import type { LocalSettingsState, SettingsModalTabId, UpdateLocalSettings } from "./settingsModal/types";
import { AccessibilityTab } from "./settingsModal/tabs/AccessibilityTab";
import { AdvancedTab } from "./settingsModal/tabs/AdvancedTab";
import { GeneralTab } from "./settingsModal/tabs/GeneralTab";
import { HighlightTab } from "./settingsModal/tabs/HighlightTab";

type SettingsModalProps = {
  onClose: () => void;
};

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();
  const { saveSettings, loadSettings, isAuthenticated } = useAppData();
  const { miningEnabled, underlinesEnabled, setMiningEnabled, setUnderlinesEnabled } = useGrammar();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsModalTabId>("general");
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [cloudAction, setCloudAction] = useState<"save" | "load" | null>(null);
  const [isApiConfigExpanded, setIsApiConfigExpanded] = useState(false);

  const [localState, setLocalState] = useState<LocalSettingsState>(() => readLocalSettingsState());
  const [jpdbApiKey, setJpdbApiKey] = useState(() => readJpdbApiKeyFromCookies());

  useEffect(() => {
    syncSettingsToStorage({ localState, jpdbApiKey });
  }, [localState, jpdbApiKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Note: Parser selection is now automatic based on JPDB API key presence

  if (!settings) return null;

  const handleChange: UpdateLocalSettings = (key, value) => {
    setLocalState((prev) => ({ ...prev, [key]: value }));
  };

  const buildSettingsObject = () => createSettingsObject({ localState, settings, jpdbApiKey });

  const applyImportedSettings = (imported: unknown) => {
    const { nextLocalState, nextJpdbApiKey, settingsUpdates } = coerceImportedSettings({
      imported,
      currentLocalState: localState,
    });

    setLocalState(nextLocalState);
    if (nextJpdbApiKey !== undefined) setJpdbApiKey(nextJpdbApiKey);
    if (Object.keys(settingsUpdates).length > 0) updateSettings(settingsUpdates);
  };

  // Manual cloud save functionality (force save current state)
  const handleCloudSave = async () => {
    if (!isAuthenticated) {
      notifyError(t("settings.toasts.save.signInRequired"));
      return;
    }

    setIsCloudLoading(true);
    setCloudAction("save");
    try {
      const settingsToSave = buildSettingsObject();
      appLog.debug("[SettingsModal] Saving comprehensive settings to Google Drive", settingsToSave);
      const success = await saveSettings(settingsToSave);
      if (success) {
        toast.success(t("settings.toasts.save.success"));
      } else {
        notifyError(t("settings.toasts.save.failure"));
      }
    } catch (error) {
      appLog.error("[SettingsModal] Cloud save error", error);
      notifyError(error, { title: t("settings.toasts.save.failure") });
    } finally {
      setIsCloudLoading(false);
      setCloudAction(null);
    }
  };

  // Manual cloud load functionality (overwrite current settings)
  const handleCloudLoad = async () => {
    if (!isAuthenticated) {
      notifyError(t("settings.toasts.load.signInRequired"));
      return;
    }

    setIsCloudLoading(true);
    setCloudAction("load");
    try {
      const cloudSettings = await loadSettings();
      appLog.debug("[SettingsModal] Loaded settings from Google Drive", cloudSettings);
      if (cloudSettings && typeof cloudSettings === "object" && Object.keys(cloudSettings).length > 0) {
        applyImportedSettings(cloudSettings);
        toast.success(t("settings.toasts.load.success"));
      } else {
        toast.info(t("settings.toasts.load.missing"));
      }
    } catch (error: unknown) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : undefined;
      if (message !== "UNAUTHORIZED") {
        appLog.error("[SettingsModal] Cloud load error", error);
        notifyError(error, { title: t("settings.toasts.load.failure") });
      }
    } finally {
      setIsCloudLoading(false);
      setCloudAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 backdrop-blur-[2px] sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="app-card flex max-h-[calc(100vh-1rem)] w-full max-w-[calc(100vw-1rem)] flex-col overflow-hidden sm:max-h-[90vh] sm:max-w-xl md:max-w-2xl"
      >
        <div className="px-4 sm:px-6 py-4 border-b app-border flex-shrink-0 flex justify-between items-center">
          <div>
            <h2 id="settings-dialog-title" className="text-lg font-semibold sm:text-xl">{t("settings.title")}</h2>
            <p className="mt-0.5 text-xs app-muted">{t("settings.description")}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("settings.footer.close")}
            className="app-icon-button flex h-10 w-10 items-center justify-center rounded-md transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b app-border flex-shrink-0">
          <div className="scrollbar-hide grid grid-cols-2 gap-1 p-2 sm:flex sm:overflow-x-auto">
            {SETTINGS_TABS.map((tabId) => (
              <button
                key={tabId}
                className={`min-h-11 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors app-nav-item ${
                  activeTab === tabId ? "app-nav-active" : ""
                }`}
                onClick={() => setActiveTab(tabId)}
              >
                {t(`settings.tabs.${tabId}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {activeTab === "general" && (
            <GeneralTab
              t={t}
              settings={settings}
              updateSettings={updateSettings}
              localState={localState}
              onLocalChange={handleChange}
            />
          )}

          {activeTab === "highlight" && (
            <HighlightTab
              t={t}
              settings={settings}
              updateSettings={updateSettings}
              localState={localState}
              onLocalChange={handleChange}
              jpdbApiKey={jpdbApiKey}
              setJpdbApiKey={setJpdbApiKey}
            />
          )}

          {activeTab === "advanced" && (
            <AdvancedTab
              t={t}
              localState={localState}
              onLocalChange={handleChange}
              isApiConfigExpanded={isApiConfigExpanded}
              setIsApiConfigExpanded={setIsApiConfigExpanded}
              miningEnabled={miningEnabled}
              underlinesEnabled={underlinesEnabled}
              setMiningEnabled={setMiningEnabled}
              setUnderlinesEnabled={setUnderlinesEnabled}
            />
          )}

          {activeTab === "accessibility" && (
            <AccessibilityTab
              t={t}
              settings={settings}
              updateSettings={updateSettings}
              localState={localState}
              onLocalChange={handleChange}
              isAuthenticated={isAuthenticated}
              isCloudLoading={isCloudLoading}
              cloudAction={cloudAction}
              onCloudSave={handleCloudSave}
              onCloudLoad={handleCloudLoad}
              createSettingsObject={buildSettingsObject}
              applyImportedSettings={applyImportedSettings}
            />
          )}
        </div>
      </div>
    </div>
  );
}

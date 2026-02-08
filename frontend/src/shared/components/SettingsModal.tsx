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
import { GeneralTab } from "./settingsModal/tabs/GeneralTab";
import { HighlightTab } from "./settingsModal/tabs/HighlightTab";

type SettingsModalProps = {
  onClose: () => void;
  onTranslate: (useCefr: boolean) => void;
  translating: boolean;
};

export function SettingsModal({ onClose, onTranslate, translating }: SettingsModalProps) {
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
            {SETTINGS_TABS.map((tabId) => (
              <button
                key={tabId}
                className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors app-nav-item ${
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
              isApiConfigExpanded={isApiConfigExpanded}
              setIsApiConfigExpanded={setIsApiConfigExpanded}
              miningEnabled={miningEnabled}
              underlinesEnabled={underlinesEnabled}
              setMiningEnabled={setMiningEnabled}
              setUnderlinesEnabled={setUnderlinesEnabled}
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

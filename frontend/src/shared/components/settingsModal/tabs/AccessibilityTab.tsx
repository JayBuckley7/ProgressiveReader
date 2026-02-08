import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { toast } from "sonner";
import type {
  AppSettings,
  LocalSettingsState,
  UpdateAppSettings,
  UpdateLocalSettings,
} from "../types";
import { CheckboxInput, TextInput } from "../inputs";

export function AccessibilityTab({
  t,
  settings,
  updateSettings,
  localState,
  onLocalChange,
  isAuthenticated,
  isCloudLoading,
  cloudAction,
  onCloudSave,
  onCloudLoad,
  createSettingsObject,
  applyImportedSettings,
}: {
  t: (key: string) => string;
  settings: AppSettings;
  updateSettings: UpdateAppSettings;
  localState: LocalSettingsState;
  onLocalChange: UpdateLocalSettings;
  isAuthenticated: boolean;
  isCloudLoading: boolean;
  cloudAction: "save" | "load" | null;
  onCloudSave: () => Promise<void>;
  onCloudLoad: () => Promise<void>;
  createSettingsObject: () => Record<string, unknown>;
  applyImportedSettings: (imported: unknown) => void;
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <CheckboxInput
          label={t("settings.accessibility.popup.label")}
          description={t("settings.accessibility.popup.description")}
          checked={settings.showPopupOnHover ?? true}
          onChange={(v) => updateSettings({ showPopupOnHover: v })}
        />
        <CheckboxInput
          label={t("settings.accessibility.touchscreen.label")}
          description={t("settings.accessibility.touchscreen.description")}
          checked={settings.touchscreenSupport ?? false}
          onChange={(v) => updateSettings({ touchscreenSupport: v })}
        />
        <CheckboxInput
          label={t("settings.accessibility.disableFade.label")}
          description={t("settings.accessibility.disableFade.description")}
          checked={settings.disableFadeAnimation ?? false}
          onChange={(v) => updateSettings({ disableFadeAnimation: v })}
        />
      </div>

      <div className="space-y-4">
        <TextInput
          label={t("settings.accessibility.customWordCss.label")}
          value={localState.customWordCSS}
          onChange={(v) => onLocalChange("customWordCSS", v)}
          multiline
          placeholder={t("settings.accessibility.customWordCss.placeholder")}
        />
        <TextInput
          label={t("settings.accessibility.customPopupCss.label")}
          value={localState.customPopupCSS}
          onChange={(v) => onLocalChange("customPopupCSS", v)}
          multiline
          placeholder={t("settings.accessibility.customPopupCss.placeholder")}
        />
      </div>

      {/* Auto-save Info */}
      {isAuthenticated && (
        <div className="app-card p-3 mb-4">
          <div className="text-sm font-medium">{t("settings.accessibility.cloudStatus.title")}</div>
          <p className="text-xs app-muted mt-1 leading-relaxed">
            {t("settings.accessibility.cloudStatus.description")}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {/* Cloud Storage Buttons */}
        {isAuthenticated && (
          <>
            <button
              onClick={onCloudSave}
              disabled={isCloudLoading}
              className="px-4 py-2 rounded-md text-sm font-medium app-button-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cloudAction === "save"
                ? t("settings.accessibility.buttons.saving")
                : t("settings.accessibility.buttons.forceSave")}
            </button>
            <button
              onClick={onCloudLoad}
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
            try {
              const settingsToExport = createSettingsObject();
              const jsonString = JSON.stringify(settingsToExport, null, 2);
              const blob = new Blob([jsonString], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `progressive_reader_settings_${new Date().toISOString().split("T")[0]}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast.success(t("settings.toasts.export.success"));
            } catch (error) {
              appLog.error("[SettingsModal] Export error", error);
              notifyError(error, { title: t("settings.toasts.export.failure") });
            }
          }}
          className="px-4 py-2 rounded-md text-sm font-medium app-button-muted transition-colors"
        >
          {t("settings.accessibility.buttons.export")}
        </button>
        <button
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onload = (event) => {
                try {
                  const importedSettings = JSON.parse(event.target?.result as string);
                  applyImportedSettings(importedSettings);
                  toast.success(t("settings.toasts.import.success"));
                } catch (error) {
                  appLog.error("[SettingsModal] Error importing settings", error);
                  notifyError(error, { title: t("settings.toasts.import.failure") });
                }
              };
              reader.readAsText(file);
            };
            input.click();
          }}
          className="px-4 py-2 rounded-md text-sm font-medium app-button-muted transition-colors"
        >
          {t("settings.accessibility.buttons.import")}
        </button>
      </div>
    </div>
  );
}


import type { AppSettings, LocalSettingsState, UpdateAppSettings, UpdateLocalSettings } from "../types";
import { CheckboxInput, SelectInput, SliderInput } from "../inputs";

export function GeneralTab({
  t,
  settings,
  updateSettings,
  localState,
  onLocalChange,
}: {
  t: (key: string) => string;
  settings: AppSettings;
  updateSettings: UpdateAppSettings;
  localState: LocalSettingsState;
  onLocalChange: UpdateLocalSettings;
}) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectInput
          label={t("settings.general.theme.label")}
          value={settings.theme}
          onChange={(v) => updateSettings({ theme: v as AppSettings["theme"] })}
          options={[
            { value: "system", label: t("settings.general.theme.options.system") },
            { value: "light", label: t("settings.general.theme.options.light") },
            { value: "dark", label: t("settings.general.theme.options.dark") },
            { value: "wood", label: t("settings.general.theme.options.wood") },
            { value: "space", label: t("settings.general.theme.options.space") },
          ]}
        />
        <SelectInput
          label={t("settings.general.targetLanguage.label")}
          value={settings.targetLanguage}
          onChange={(v) => updateSettings({ targetLanguage: v })}
          options={[
            { value: "English", label: t("settings.general.targetLanguage.options.English") },
            { value: "Japanese", label: t("settings.general.targetLanguage.options.Japanese") },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <SelectInput
            label={t("settings.general.uiLanguage.label")}
            value={settings.uiLanguage}
            onChange={(v) => updateSettings({ uiLanguage: v })}
            options={[
              { value: "en", label: t("settings.general.uiLanguage.options.en") },
              { value: "ja", label: t("settings.general.uiLanguage.options.ja") },
            ]}
          />
          <p className="text-xs app-muted">{t("settings.general.uiLanguage.description")}</p>
        </div>
        <SelectInput
          label={t("settings.general.cefr.label")}
          value={String(localState.cefrLevel)}
          onChange={(v) => onLocalChange("cefrLevel", parseInt(v, 10))}
          options={[
            { value: "0", label: t("settings.general.cefr.options.0") },
            { value: "1", label: t("settings.general.cefr.options.1") },
            { value: "2", label: t("settings.general.cefr.options.2") },
            { value: "3", label: t("settings.general.cefr.options.3") },
            { value: "4", label: t("settings.general.cefr.options.4") },
            { value: "5", label: t("settings.general.cefr.options.5") },
          ]}
        />
      </div>

      <CheckboxInput
        label={t("settings.general.autoload.label")}
        description={t("settings.general.autoload.description")}
        checked={localState.autoload}
        onChange={(v) => onLocalChange("autoload", v)}
      />

      <CheckboxInput
        label={t("settings.general.cacheTranslations.label")}
        description={t("settings.general.cacheTranslations.description")}
        checked={settings.cacheTranslations ?? true}
        onChange={(v) => updateSettings({ cacheTranslations: v })}
      />

      <SliderInput
        label={t("settings.general.fontSize.label")}
        value={settings.fontSize}
        onChange={(v) => updateSettings({ fontSize: v })}
        min={12}
        max={24}
        unit="px"
      />
    </div>
  );
}


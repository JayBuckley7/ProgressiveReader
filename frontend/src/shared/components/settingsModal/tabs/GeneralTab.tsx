import type { AppSettings, LocalSettingsState, UpdateAppSettings, UpdateLocalSettings } from "../types";
import { CheckboxInput, SelectInput, SliderInput, TextInput } from "../inputs";

export function GeneralTab({
  t,
  settings,
  updateSettings,
  localState,
  onLocalChange,
  isApiConfigExpanded,
  setIsApiConfigExpanded,
  miningEnabled,
  underlinesEnabled,
  setMiningEnabled,
  setUnderlinesEnabled,
}: {
  t: (key: string) => string;
  settings: AppSettings;
  updateSettings: UpdateAppSettings;
  localState: LocalSettingsState;
  onLocalChange: UpdateLocalSettings;
  isApiConfigExpanded: boolean;
  setIsApiConfigExpanded: (v: boolean) => void;
  miningEnabled: boolean;
  underlinesEnabled: boolean;
  setMiningEnabled: (v: boolean) => void;
  setUnderlinesEnabled: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="app-card overflow-hidden">
        <button
          onClick={() => setIsApiConfigExpanded(!isApiConfigExpanded)}
          aria-expanded={isApiConfigExpanded}
          className="w-full flex items-start justify-between gap-4 p-4 text-left hover:bg-[var(--ui-surface-alt)] transition-colors"
        >
          <div>
            <h3 className="text-sm font-semibold">{t("settings.general.api.title")}</h3>
            <p className="text-xs app-muted mt-1">{t("settings.general.api.description")}</p>
          </div>
          <span className="text-lg leading-none font-medium app-muted select-none">
            {isApiConfigExpanded ? "–" : "+"}
          </span>
        </button>

        {isApiConfigExpanded && (
          <div className="px-4 pb-4 border-t app-border">
            <div className="pt-4 space-y-3">
              <p className="text-xs app-muted leading-relaxed">{t("settings.general.api.note")}</p>
              <TextInput
                label={t("settings.general.api.inputLabel")}
                value={localState.openaiKey}
                onChange={(v) => onLocalChange("openaiKey", v)}
                placeholder={t("settings.general.api.placeholder")}
                type="password"
              />
            </div>
          </div>
        )}
      </div>

      <div className="app-card p-4">
        <h3 className="text-sm font-semibold">Grammar</h3>
        <p className="text-xs app-muted mt-1">
          Grammar mining sends small snippets of your text to OpenAI for validation. Underlines run locally.
        </p>

        <div className="mt-4 space-y-4">
          <CheckboxInput
            label="AI Grammar Mining"
            description="Background service that searches your library (only up to your reading progress) for examples of grammar points you mark as Learning."
            checked={miningEnabled}
            onChange={setMiningEnabled}
          />

          <CheckboxInput
            label="Grammar Underlines In Reader"
            description="Underline grammar points you are currently Learning on the page you're reading, and show them in the JPDB popup."
            checked={underlinesEnabled}
            onChange={setUnderlinesEnabled}
          />
        </div>
      </div>

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
          label={t("settings.general.model.label")}
          value={localState.openaiModel}
          onChange={(v) => onLocalChange("openaiModel", v)}
          options={[
            { value: "gpt-4o-mini", label: t("settings.general.model.options.gpt-4o-mini") },
            { value: "gpt-4", label: t("settings.general.model.options.gpt-4") },
            { value: "gpt-3.5-turbo", label: t("settings.general.model.options.gpt-3.5-turbo") },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectInput
          label={t("settings.general.targetLanguage.label")}
          value={settings.targetLanguage}
          onChange={(v) => updateSettings({ targetLanguage: v })}
          options={[
            { value: "English", label: t("settings.general.targetLanguage.options.English") },
            { value: "Japanese", label: t("settings.general.targetLanguage.options.Japanese") },
          ]}
        />
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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


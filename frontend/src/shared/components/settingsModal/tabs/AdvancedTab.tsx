import type { LocalSettingsState, UpdateLocalSettings } from "../types";
import { CheckboxInput, SelectInput, TextInput } from "../inputs";

export function AdvancedTab({
  t,
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
    <div className="space-y-5 animate-fade-in">
      <div className="border-b app-border pb-5">
        <h3 className="text-sm font-semibold">Study automation</h3>
        <p className="mt-1 text-xs leading-relaxed app-muted">
          Optional background features for grammar mining and in-reader guidance.
        </p>

        <div className="mt-4 space-y-4">
          <CheckboxInput
            label="AI Grammar Mining"
            description="Search the part of your library you have already read for examples of grammar points marked Learning."
            checked={miningEnabled}
            onChange={setMiningEnabled}
          />
          <CheckboxInput
            label="Grammar Underlines In Reader"
            description="Underline grammar points marked Learning on the current page."
            checked={underlinesEnabled}
            onChange={setUnderlinesEnabled}
          />
        </div>
      </div>

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

      <div className="overflow-hidden rounded-md border app-border">
        <button
          type="button"
          onClick={() => setIsApiConfigExpanded(!isApiConfigExpanded)}
          aria-expanded={isApiConfigExpanded}
          className="flex w-full items-start justify-between gap-4 p-4 text-left transition-colors hover:bg-[var(--ui-surface-alt)]"
        >
          <div>
            <h3 className="text-sm font-semibold">{t("settings.general.api.title")}</h3>
            <p className="mt-1 text-xs app-muted">{t("settings.general.api.description")}</p>
          </div>
          <span aria-hidden="true" className="select-none text-lg font-medium leading-none app-muted">
            {isApiConfigExpanded ? "−" : "+"}
          </span>
        </button>

        {isApiConfigExpanded ? (
          <div className="space-y-3 border-t app-border px-4 pb-4 pt-4">
            <p className="text-xs leading-relaxed app-muted">{t("settings.general.api.note")}</p>
            <TextInput
              label={t("settings.general.api.inputLabel")}
              value={localState.openaiKey}
              onChange={(v) => onLocalChange("openaiKey", v)}
              placeholder={t("settings.general.api.placeholder")}
              type="password"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

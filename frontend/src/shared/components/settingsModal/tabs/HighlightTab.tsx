import type { AppSettings, LocalSettingsState, UpdateAppSettings, UpdateLocalSettings } from "../types";
import { CheckboxInput, TextInput } from "../inputs";

export function HighlightTab({
  t,
  settings,
  updateSettings,
  localState,
  onLocalChange,
  jpdbApiKey,
  setJpdbApiKey,
}: {
  t: (key: string) => string;
  settings: AppSettings;
  updateSettings: UpdateAppSettings;
  localState: LocalSettingsState;
  onLocalChange: UpdateLocalSettings;
  jpdbApiKey: string;
  setJpdbApiKey: (v: string) => void;
}) {
  return (
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
        onChange={(v) => updateSettings({ hideFurigana: v })}
      />

      {jpdbApiKey && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextInput
              label={t("settings.highlight.deck.mining")}
              value={localState.jpdbDeckId}
              onChange={(v) => onLocalChange("jpdbDeckId", v)}
              placeholder={t("settings.highlight.deck.placeholder")}
            />
            <TextInput
              label={t("settings.highlight.deck.forq")}
              value={localState.forqDeckId}
              onChange={(v) => onLocalChange("forqDeckId", v)}
              placeholder={t("settings.highlight.deck.placeholder")}
            />
            <TextInput
              label={t("settings.highlight.deck.blacklist")}
              value={localState.blacklistDeckId}
              onChange={(v) => onLocalChange("blacklistDeckId", v)}
              placeholder={t("settings.highlight.deck.placeholder")}
            />
            <TextInput
              label={t("settings.highlight.deck.neverForget")}
              value={localState.neverForgetDeckId}
              onChange={(v) => onLocalChange("neverForgetDeckId", v)}
              placeholder={t("settings.highlight.deck.placeholder")}
            />
          </div>

          <TextInput
            label={t("settings.highlight.context.label")}
            type="number"
            value={String(localState.contextSentenceCount)}
            onChange={(v) => onLocalChange("contextSentenceCount", parseInt(v, 10) || 1)}
            min="1"
            max="5"
          />

          <div className="space-y-3">
            <CheckboxInput
              label={t("settings.highlight.options.autoAdd.label")}
              description={t("settings.highlight.options.autoAdd.description")}
              checked={localState.autoAddToFORQ}
              onChange={(v) => onLocalChange("autoAddToFORQ", v)}
            />
            <CheckboxInput
              label={t("settings.highlight.options.preferDueCards.label")}
              description={t("settings.highlight.options.preferDueCards.description")}
              checked={localState.preferDueCards}
              onChange={(v) => onLocalChange("preferDueCards", v)}
            />
          </div>
        </>
      )}
    </div>
  );
}


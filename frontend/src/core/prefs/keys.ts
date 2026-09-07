export const PREF_KEYS = {
  openAiKey: "openaiKey",
  openAiModel: "openaiModel",
  cefrLevel: "cefrLevel",
  autoloadTranslations: "autoloadTranslations",
  disableMix: "prDisableMix",
  grammarMiningEnabled: "prGrammarMiningEnabled",
  grammarUnderlinesEnabled: "prGrammarUnderlinesEnabled",
} as const;

export const DEFAULTS = {
  openAiModel: "gpt-5.6-terra",
  cefrLevel: "B2",
} as const;


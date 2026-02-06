package com.progressivereader.kmp.settings

import kotlinx.serialization.Serializable

@Serializable
data class ReaderSettings(
    // Matches web semantics: "system", "light", "dark" (web also has "wood"/"space"; treat as dark when imported).
    val theme: String = "dark",
    val fontSizeSp: Float = 18f,
    val ttsRate: Float = 1.0f,
    val cefrLevel: String = "B1",
    val openAiApiKey: String? = null,
    val openAiModel: String = "gpt-4o-mini",
    val cacheTranslations: Boolean = true,
    val uiLanguage: String = "en",
    val jpdbApiKey: String? = null,
    val jpdbHighlightEnabled: Boolean = false,
    val translationTargetLang: String = "English",
)




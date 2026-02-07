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
    // Mix Japanese: swap in known JP words while reading English.
    val mixEnabled: Boolean = false,
    // 0..1 probability to swap an eligible gloss occurrence.
    val mixAggression: Float = 0.25f,
    // Convenience: turn on JPDB highlighting when mix mode is enabled (so swapped words are tappable).
    val mixAutoEnableHighlight: Boolean = true,
    // Back up the mirror snapshot as `jpdb_mirror_v1.json` in the Drive app folder.
    val mixBackupMirrorToDrive: Boolean = true,
)



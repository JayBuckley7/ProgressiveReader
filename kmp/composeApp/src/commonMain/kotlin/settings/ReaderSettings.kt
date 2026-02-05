package com.progressivereader.kmp.settings

import kotlinx.serialization.Serializable

@Serializable
data class ReaderSettings(
    val darkMode: Boolean = true,
    val fontSizeSp: Float = 18f,
    val ttsRate: Float = 1.0f,
    val cefrLevel: String = "B1",
    val jpdbApiKey: String? = null,
    val jpdbHighlightEnabled: Boolean = false,
    val translationTargetLang: String = "English",
)





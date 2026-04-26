package com.progressivereader.kmp.reader

import androidx.compose.runtime.Composable

enum class SwipeDirection {
    LEFT,
    RIGHT,
}

data class HtmlDocumentSpec(
    val bodyHtml: String,
    val headHtml: String = "",
    val baseUrl: String? = null,
    val chapterKey: String,
    val contentKey: String,
)

data class HtmlPresentationSpec(
    val darkMode: Boolean,
    val fontSizeSp: Float,
)

@Composable
expect fun HtmlContent(
    document: HtmlDocumentSpec,
    presentation: HtmlPresentationSpec,
    onUrlClick: (String) -> Boolean,
    onSwipe: ((SwipeDirection) -> Unit)?,
)

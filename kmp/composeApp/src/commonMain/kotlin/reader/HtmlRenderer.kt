package com.progressivereader.kmp.reader

import androidx.compose.runtime.Composable

enum class SwipeDirection {
    LEFT,
    RIGHT,
}

@Composable
expect fun HtmlContent(
    html: String,
    baseUrl: String?,
    darkMode: Boolean,
    fontSizeSp: Float,
    onUrlClick: (String) -> Boolean,
    onSwipe: ((SwipeDirection) -> Unit)?,
)

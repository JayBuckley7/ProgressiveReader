package com.progressivereader.kmp.reader

import androidx.compose.runtime.Composable

@Composable
expect fun HtmlContent(
    html: String,
    baseUrl: String?,
    darkMode: Boolean,
    fontSizeSp: Float,
    onUrlClick: (String) -> Boolean,
)

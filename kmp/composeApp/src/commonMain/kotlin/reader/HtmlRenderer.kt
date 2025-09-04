package com.progressivereader.kmp.reader

import androidx.compose.runtime.Composable

@Composable
expect fun HtmlContent(
    html: String,
    darkMode: Boolean,
    fontSizeSp: Float
)



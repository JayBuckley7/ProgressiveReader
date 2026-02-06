package com.progressivereader.kmp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable

@Composable
fun isDarkThemeMode(theme: String): Boolean {
    val normalized = theme.trim().lowercase()
    return when (normalized) {
        "light" -> false
        "dark" -> true
        "system" -> isSystemInDarkTheme()
        // Web-only themes; treat as dark on mobile for now.
        "wood" -> true
        "space" -> true
        else -> isSystemInDarkTheme()
    }
}


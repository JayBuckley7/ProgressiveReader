package com.progressivereader.kmp.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext

private val LightColors =
    lightColorScheme()

private val DarkColors =
    darkColorScheme()

@Composable
fun ProgressiveReaderTheme(content: @Composable () -> Unit) {
    val darkTheme = isSystemInDarkTheme()
    val context = LocalContext.current

    val colorScheme =
        when {
            Build.VERSION.SDK_INT >= 31 && darkTheme -> dynamicDarkColorScheme(context)
            Build.VERSION.SDK_INT >= 31 && !darkTheme -> dynamicLightColorScheme(context)
            darkTheme -> DarkColors
            else -> LightColors
        }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
    ) {
        Surface(modifier = Modifier, color = MaterialTheme.colorScheme.background) {
            content()
        }
    }
}


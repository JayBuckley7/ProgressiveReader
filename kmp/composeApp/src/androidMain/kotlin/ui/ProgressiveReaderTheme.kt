package com.progressivereader.kmp.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Shapes
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.isSystemInDarkTheme

private val LightColors =
    lightColorScheme(
        primary = Color(0xFF14181F), // --ui-accent
        onPrimary = Color(0xFFFFFFFF), // --ui-accent-contrast
        background = Color(0xFFF7F6F2), // --ui-bg
        onBackground = Color(0xFF14181F), // --ui-text
        surface = Color(0xFFFFFFFF), // --ui-surface
        onSurface = Color(0xFF14181F), // --ui-text
        surfaceVariant = Color(0xFFF1F0EA), // --ui-surface-alt
        onSurfaceVariant = Color(0xFF5B6472), // --ui-muted
        outline = Color(0xFFE6E2D8), // --ui-border
        secondary = Color(0xFF14181F),
        onSecondary = Color(0xFFFFFFFF),
    )

private val DarkColors =
    darkColorScheme(
        primary = Color(0xEBFFFFFF), // --ui-accent (rgba 255,255,255,0.92)
        onPrimary = Color(0xFF0E1114), // --ui-accent-contrast
        background = Color(0xFF0E1114), // --ui-bg
        onBackground = Color(0xEBFFFFFF), // --ui-text
        surface = Color(0xFF14181D), // --ui-surface
        onSurface = Color(0xEBFFFFFF), // --ui-text
        surfaceVariant = Color(0xFF10161B), // --ui-surface-alt
        onSurfaceVariant = Color(0xA3FFFFFF), // --ui-muted (rgba 255,255,255,0.64)
        outline = Color(0x14FFFFFF), // --ui-border (rgba 255,255,255,0.08)
        secondary = Color(0xEBFFFFFF),
        onSecondary = Color(0xFF0E1114),
    )

private val AppTypography =
    Typography(
        titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 22.sp),
        titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp),
        titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 16.sp),
        bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 16.sp),
        bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 14.sp),
        bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp),
        labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp),
        labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 12.sp),
        labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 11.sp),
    )

private val AppShapes =
    Shapes(
        small = RoundedCornerShape(8.dp),
        // Match web: border-radius: 10px 8px 8px 6px;
        medium =
            RoundedCornerShape(
                topStart = 10.dp,
                topEnd = 8.dp,
                bottomEnd = 8.dp,
                bottomStart = 6.dp,
            ),
        large = RoundedCornerShape(12.dp),
    )

@Composable
fun ProgressiveReaderTheme(
    theme: String,
    content: @Composable () -> Unit,
) {
    val normalized = theme.trim().lowercase()
    val darkTheme =
        when (normalized) {
            "light" -> false
            "dark" -> true
            "system" -> isSystemInDarkTheme()
            // Web-only themes; treat as dark on mobile for now.
            "wood" -> true
            "space" -> true
            else -> isSystemInDarkTheme()
        }
    val colorScheme = if (darkTheme) DarkColors else LightColors

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        shapes = AppShapes,
    ) {
        Surface(modifier = Modifier, color = MaterialTheme.colorScheme.background) {
            content()
        }
    }
}

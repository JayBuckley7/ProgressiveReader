package com.progressivereader.kmp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
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

private val LightColors =
    lightColorScheme(
        primary = Color(0xFF4E6B5D),
        onPrimary = Color(0xFFFFFFFF),
        background = Color(0xFFF3F5F2),
        onBackground = Color(0xFF18201C),
        surface = Color(0xFFFAFBF8),
        onSurface = Color(0xFF18201C),
        surfaceVariant = Color(0xFFE7ECE6),
        onSurfaceVariant = Color(0xFF607067),
        outline = Color(0xFFCDD7CF),
        secondary = Color(0xFFB8783B),
        onSecondary = Color(0xFFFFFFFF),
    )

private val DarkColors =
    darkColorScheme(
        primary = Color(0xFF93B5A2),
        onPrimary = Color(0xFF0D1511),
        background = Color(0xFF111513),
        onBackground = Color(0xFFE8ECE7),
        surface = Color(0xFF171C19),
        onSurface = Color(0xFFE8ECE7),
        surfaceVariant = Color(0xFF202723),
        onSurfaceVariant = Color(0xFFA7B2AB),
        outline = Color(0xFF344039),
        secondary = Color(0xFFD39B67),
        onSecondary = Color(0xFF20150B),
    )

private val AppTypography =
    Typography(
        titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 24.sp),
        titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 18.sp),
        titleSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 15.sp),
        bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 15.sp),
        bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 14.sp),
        bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Normal, fontSize = 12.sp),
        labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp),
        labelMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 12.sp),
        labelSmall = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 11.sp),
    )

private val AppShapes =
    Shapes(
        small = RoundedCornerShape(6.dp),
        medium = RoundedCornerShape(8.dp),
        large = RoundedCornerShape(8.dp),
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

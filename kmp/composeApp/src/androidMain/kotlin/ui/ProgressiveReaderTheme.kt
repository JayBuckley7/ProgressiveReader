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
        primary = Color(0xFF315F8C),
        onPrimary = Color(0xFFFFFFFF),
        primaryContainer = Color(0xFFD7E8F8),
        onPrimaryContainer = Color(0xFF123552),
        background = Color(0xFFF5F2EC),
        onBackground = Color(0xFF1C2025),
        surface = Color(0xFFFCFAF6),
        onSurface = Color(0xFF1C2025),
        surfaceVariant = Color(0xFFE9E5DE),
        onSurfaceVariant = Color(0xFF62666C),
        outline = Color(0xFFD2CEC6),
        secondary = Color(0xFF315F8C),
        onSecondary = Color(0xFFFFFFFF),
        error = Color(0xFFB3261E),
    )

private val DarkColors =
    darkColorScheme(
        primary = Color(0xFFA9CDEE),
        onPrimary = Color(0xFF0B2C48),
        primaryContainer = Color(0xFF244D73),
        onPrimaryContainer = Color(0xFFD7E8F8),
        background = Color(0xFF111316),
        onBackground = Color(0xFFE8E5DF),
        surface = Color(0xFF191C20),
        onSurface = Color(0xFFE8E5DF),
        surfaceVariant = Color(0xFF25292E),
        onSurfaceVariant = Color(0xFFB8BBC0),
        outline = Color(0xFF3A3F45),
        secondary = Color(0xFFA9CDEE),
        onSecondary = Color(0xFF0B2C48),
    )

private val AppTypography =
    Typography(
        titleLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 26.sp),
        titleMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.SemiBold, fontSize = 19.sp),
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
        medium = RoundedCornerShape(12.dp),
        large = RoundedCornerShape(18.dp),
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

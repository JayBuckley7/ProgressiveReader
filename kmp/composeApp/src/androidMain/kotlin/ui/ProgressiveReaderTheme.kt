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

private val LightColors =
    lightColorScheme(
        primary = Color(0xFF11151C),
        onPrimary = Color(0xFFFFFFFF),
        background = Color(0xFFF6F7F9),
        onBackground = Color(0xFF11151C),
        surface = Color(0xFFFFFFFF),
        onSurface = Color(0xFF11151C),
        surfaceVariant = Color(0xFFF0F2F5),
        onSurfaceVariant = Color(0xFF55606F),
        outline = Color(0xFFE2E4E8),
        secondary = Color(0xFF11151C),
        onSecondary = Color(0xFFFFFFFF),
    )

private val DarkColors =
    darkColorScheme(
        primary = Color(0xEBFFFFFF), // rgba(255,255,255,0.92)
        onPrimary = Color(0xFF0E1114),
        background = Color(0xFF0E1114),
        onBackground = Color(0xEBFFFFFF),
        surface = Color(0xFF14181D),
        onSurface = Color(0xEBFFFFFF),
        surfaceVariant = Color(0xFF10161B),
        onSurfaceVariant = Color(0xA3FFFFFF), // rgba(255,255,255,0.64)
        outline = Color(0x14FFFFFF), // rgba(255,255,255,0.08)
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
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
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

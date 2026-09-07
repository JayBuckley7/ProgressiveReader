package com.progressivereader.kmp.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarItemColors
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private fun decodeCover(path: String, targetPx: Int = 720): ImageBitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sampleSize = 1
    while (bounds.outWidth / sampleSize > targetPx * 2 || bounds.outHeight / sampleSize > targetPx * 2) {
        sampleSize *= 2
    }

    val options =
        BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = android.graphics.Bitmap.Config.RGB_565
        }
    return BitmapFactory.decodeFile(path, options)?.asImageBitmap()
}

@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 0.dp,
    ) {
        content()
    }
}

@Composable
fun AppChip(
    text: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

@Composable
fun AppPrimaryButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
    icon: (@Composable () -> Unit)? = null,
) {
    Button(
        modifier = modifier,
        enabled = enabled,
        onClick = onClick,
        colors =
            ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.6f)),
        shape = MaterialTheme.shapes.medium,
    ) {
        if (icon != null) {
            icon()
            Spacer(Modifier.width(8.dp))
        }
        Text(text)
    }
}

@Composable
fun AppTonalButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
    icon: (@Composable () -> Unit)? = null,
) {
    OutlinedButton(
        modifier = modifier,
        enabled = enabled,
        onClick = onClick,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.34f)),
        colors =
            ButtonDefaults.outlinedButtonColors(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ),
    ) {
        if (icon != null) {
            icon()
            Spacer(Modifier.width(8.dp))
        }
        Text(text)
    }
}

@Composable
fun AppOutlineButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
    icon: (@Composable () -> Unit)? = null,
) {
    OutlinedButton(
        modifier = modifier,
        enabled = enabled,
        onClick = onClick,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.28f)),
        colors =
            ButtonDefaults.outlinedButtonColors(
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.55f),
                contentColor = MaterialTheme.colorScheme.onSurface,
            ),
    ) {
        if (icon != null) {
            icon()
            Spacer(Modifier.width(8.dp))
        }
        Text(text)
    }
}

@Composable
fun AppTextButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    TextButton(
        modifier = modifier,
        enabled = enabled,
        onClick = onClick,
    ) {
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun AppMutedText(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        modifier = modifier,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodySmall,
    )
}

@Composable
fun AppSectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        modifier = modifier,
        style = MaterialTheme.typography.titleMedium,
    )
}

@Composable
fun AppSectionSurface(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.14f)),
    ) {
        content()
    }
}

@Composable
fun appShellBarColors(): NavigationBarItemColors =
    androidx.compose.material3.NavigationBarItemDefaults.colors(
        selectedIconColor = MaterialTheme.colorScheme.primary,
        selectedTextColor = MaterialTheme.colorScheme.onSurface,
        indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
    )

@Composable
fun AppIconTile(
    icon: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.18f)),
    ) {
        Box(
            modifier = Modifier.size(44.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun CoverArt(
    coverPath: String?,
    title: String,
    modifier: Modifier = Modifier,
    typeLabel: String = "EPUB",
) {
    val imageState = produceState<ImageBitmap?>(initialValue = null, coverPath) {
        value =
            withContext(Dispatchers.IO) {
                if (coverPath.isNullOrBlank()) return@withContext null
                runCatching { decodeCover(coverPath) }.getOrNull()
            }
    }

    val image = imageState.value
    if (image != null) {
        Image(
            bitmap = image,
            contentDescription = title,
            modifier = modifier.clip(MaterialTheme.shapes.medium),
            contentScale = ContentScale.Crop,
        )
    } else {
        CoverPlaceholder(title = title, typeLabel = typeLabel, modifier = modifier)
    }
}

@Composable
fun CoverPlaceholder(
    title: String,
    typeLabel: String,
    modifier: Modifier = Modifier,
) {
    val shape = MaterialTheme.shapes.medium
    val border = MaterialTheme.colorScheme.outline.copy(alpha = 0.24f)
    val gradient =
        Brush.linearGradient(
            listOf(
                MaterialTheme.colorScheme.surfaceVariant,
                MaterialTheme.colorScheme.surface,
                MaterialTheme.colorScheme.secondary.copy(alpha = 0.12f),
            ),
        )
    Box(
        modifier =
            modifier
                .clip(shape)
                .background(gradient)
                .border(BorderStroke(1.dp, border), shape),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.Start,
        ) {
            AppChip(text = typeLabel.trim().ifBlank { "EPUB" })
            Spacer(Modifier.height(8.dp))
            Text(
                text = title.trim().ifBlank { "Book" }.take(1).uppercase(),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
fun CardHeaderRow(
    title: String,
    subtitle: String?,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!subtitle.isNullOrBlank()) {
                AppMutedText(subtitle)
            }
        }
        if (trailing != null) trailing()
    }
}

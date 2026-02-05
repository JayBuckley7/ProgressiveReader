package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.CachedBookEntry
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.settings.AppSettings

@Composable
fun ReaderHostScreen(
    bookId: String,
    settings: AppSettings,
    sessionJwt: String?,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onSetDarkMode: (Boolean) -> Unit,
    onSetFontSizeSp: (Float) -> Unit,
    onSetTtsRate: (Float) -> Unit,
    onSetJpdbHighlightEnabled: (Boolean) -> Unit,
) {
    var cachedEntry by remember(bookId) { mutableStateOf<CachedBookEntry?>(null) }
    var indexLoaded by remember(bookId) { mutableStateOf(false) }
    var indexLoadFailed by remember(bookId) { mutableStateOf(false) }

    LaunchedEffect(bookId) {
        indexLoadFailed = false
        indexLoaded = false
        cachedEntry =
            runCatching { bookCache.loadIndex() }
                .onFailure { indexLoadFailed = true }
                .getOrNull()
                ?.books
                ?.firstOrNull { it.id == bookId }
        indexLoaded = true
    }

    val isPdf =
        cachedEntry?.let { entry -> bookCache.cachedContentFile(entry).name.endsWith(".pdf", ignoreCase = true) }
            ?: bookCache.pdfFile(bookId).exists()

    when {
        indexLoadFailed -> {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Failed to load book metadata.", color = MaterialTheme.colorScheme.error)
                AppOutlineButton(text = "Back", onClick = onBack)
            }
        }

        !indexLoaded -> {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CircularProgressIndicator()
            }
        }

        cachedEntry == null -> {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Book is not cached.", color = MaterialTheme.colorScheme.error)
                AppOutlineButton(text = "Back", onClick = onBack)
            }
        }

        isPdf ->
            PdfReaderScreen(
                bookId = bookId,
                title = cachedEntry?.name ?: "PDF",
                settings = settings,
                bookCache = bookCache,
                onBack = onBack,
                onOpenSettings = onOpenSettings,
                onSetTtsRate = onSetTtsRate,
            )

        else ->
            ReaderScreen(
                bookId = bookId,
                settings = settings,
                sessionJwt = sessionJwt,
                bookCache = bookCache,
                epubRepository = epubRepository,
                onBack = onBack,
                onOpenSettings = onOpenSettings,
                onSetDarkMode = onSetDarkMode,
                onSetFontSizeSp = onSetFontSizeSp,
                onSetTtsRate = onSetTtsRate,
                onSetJpdbHighlightEnabled = onSetJpdbHighlightEnabled,
            )
    }
}

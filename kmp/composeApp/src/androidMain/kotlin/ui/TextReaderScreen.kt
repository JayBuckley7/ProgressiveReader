package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.reader.HtmlContent
import com.progressivereader.kmp.settings.AppSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TextReaderScreen(
    bookId: String,
    title: String,
    settings: AppSettings,
    bookCache: BookCache,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val textFile = remember(bookId) { bookCache.txtFile(bookId) }

    var isLoading by remember(bookId) { mutableStateOf(true) }
    var loadError by remember(bookId) { mutableStateOf<String?>(null) }
    var html by remember(bookId) { mutableStateOf<String?>(null) }

    fun escapeHtml(text: String): String =
        text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")

    LaunchedEffect(bookId) {
        isLoading = true
        loadError = null
        html = null
        val loaded =
            withContext(Dispatchers.IO) {
                if (!textFile.exists()) return@withContext null
                runCatching { textFile.readText(Charsets.UTF_8) }.getOrNull()
            }
        isLoading = false

        if (loaded == null) {
            loadError = "TXT file is not cached."
        } else {
            // Preserve whitespace and line breaks.
            val safe = escapeHtml(loaded)
            html = "<pre style=\"white-space: pre-wrap; margin: 0;\">$safe</pre>"
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                title = {
                    Text(
                        text = title,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                isLoading -> {
                    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        CircularProgressIndicator()
                    }
                }

                loadError != null -> {
                    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(loadError!!, color = MaterialTheme.colorScheme.error)
                        AppOutlineButton(text = "Back", onClick = onBack)
                    }
                }

                html == null -> {
                    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("No text content.", color = MaterialTheme.colorScheme.error)
                    }
                }

                else -> {
                    HtmlContent(
                        html = html!!,
                        baseUrl = null,
                        darkMode = isDarkThemeMode(settings.reader.theme),
                        fontSizeSp = settings.reader.fontSizeSp,
                        onUrlClick = { true },
                        onSwipe = null,
                    )
                }
            }
        }
    }
}

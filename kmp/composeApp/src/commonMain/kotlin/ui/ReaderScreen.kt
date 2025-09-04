package com.progressivereader.kmp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DrawerState
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.progressivereader.kmp.translate.TranslateService
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.EpubParser
import com.progressivereader.kmp.reader.BookmarksService
import com.progressivereader.kmp.reader.HtmlContent
import com.progressivereader.kmp.jpdb.JpdbHighlighter
import com.progressivereader.kmp.jpdb.JpdbService
import com.progressivereader.kmp.settings.SettingsRepository
import com.progressivereader.kmp.settings.SettingsService

@Composable
fun ReaderScreen(bookId: String, sessionTokenProvider: () -> String?) {
    val darkMode = rememberSaveable { mutableStateOf(false) }
    val fontSizeSp = rememberSaveable { mutableStateOf(18f) }
    val translateService = remember { TranslateService(sessionTokenProvider) }
    val translated = remember { mutableStateOf<String?>(null) }
    val driveService = remember { DriveService(sessionTokenProvider) }
    val bookmarksService = remember { BookmarksService(sessionTokenProvider) }
    val epub = remember { mutableStateOf<EpubBook?>(null) }
    val chapterIndex = rememberSaveable { mutableStateOf(0) }
    val bookmarks = remember { mutableStateOf(listOf<BookmarksService.Bookmark>()) }
    val drawerState: DrawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val jpdb = remember { JpdbService(sessionTokenProvider) }
    val settingsRepo = remember { SettingsRepository(SettingsService(sessionTokenProvider)) }
    val readerSettings = remember { mutableStateOf(com.progressivereader.kmp.settings.ReaderSettings()) }

    val bg = if (darkMode.value) Color(0xFF101010) else Color(0xFFFAFAF5)
    val fg = if (darkMode.value) Color(0xFFEDEDED) else Color(0xFF1C1C1C)

    LaunchedEffect(bookId) {
        // Load EPUB from Drive
        driveService.download(bookId)?.let { bytes ->
            epub.value = EpubParser().parse(bytes)
            // Load bookmarks for this book
            bookmarks.value = bookmarksService.list(bookId)
        }
        readerSettings.value = settingsRepo.loadReaderSettings()
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Text("Table of Contents", modifier = Modifier.padding(16.dp))
                val toc = epub.value?.toc.orEmpty()
                androidx.compose.foundation.lazy.LazyColumn {
                    items(toc.size) { i ->
                        val item = toc[i]
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                            Text(item.title, modifier = Modifier.clickable {
                                chapterIndex.value = item.index
                                androidx.compose.runtime.rememberCoroutineScope().launch { drawerState.close() }
                            })
                        }
                    }
                }
            }
        }
    ) {
        Column(modifier = Modifier.fillMaxSize().background(bg).padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(epub.value?.title ?: "Reader", color = fg, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.weight(1f))
                TextButton(onClick = { androidx.compose.runtime.rememberCoroutineScope().launch { drawerState.open() } }) { Text("TOC", color = fg) }
            TextButton(onClick = { if (fontSizeSp.value > 12f) fontSizeSp.value -= 2f; readerSettings.value = readerSettings.value.copy(fontSizeSp = fontSizeSp.value) }) { Text("A-", color = fg) }
            TextButton(onClick = { if (fontSizeSp.value < 32f) fontSizeSp.value += 2f; readerSettings.value = readerSettings.value.copy(fontSizeSp = fontSizeSp.value) }) { Text("A+", color = fg) }
            TextButton(onClick = { darkMode.value = !darkMode.value; readerSettings.value = readerSettings.value.copy(darkMode = darkMode.value) }) { Text(if (darkMode.value) "Light" else "Dark", color = fg) }
            Button(onClick = {
                // Demo chapter translate of current chapter
                val html = epub.value?.chapters?.getOrNull(chapterIndex.value) ?: return@Button
                translated.value = null
                androidx.compose.runtime.rememberCoroutineScope().launch {
                    val res = translateService.translateChapter(
                        TranslateService.ChapterTranslateRequest(
                            content = html,
                            target_lang = "English",
                            use_cefr = true,
                            cefr_level = readerSettings.value.cefrLevel,
                            translation_service = "openai"
                        )
                    )
                    translated.value = res?.translated_text
                }
            }) { Text("Translate") }
        }

        Spacer(Modifier.height(8.dp))
            val html = epub.value?.chapters?.getOrNull(chapterIndex.value) ?: "Loading..."
            // Hook JPDB highlighter
            JpdbHighlighter(
                text = html,
                jpdbApiKeyProvider = { readerSettings.value.jpdbApiKey },
                analyze = { segs, key -> jpdb.analyze(segs, key) }
            ) { highlightedHtml ->
                HtmlContent(html = highlightedHtml, darkMode = darkMode.value, fontSizeSp = fontSizeSp.value)
            }
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = {
                    androidx.compose.runtime.rememberCoroutineScope().launch {
                        bookmarksService.add(bookId, chapterIndex.value, 0, null)
                        bookmarks.value = bookmarksService.list(bookId)
                    }
                }) { Text("Bookmark") }
                Text("Bookmarks: ${bookmarks.value.size}")
            }
            translated.value?.let { t ->
                Spacer(Modifier.height(16.dp))
                Text("Translated:")
                Text(t, color = fg, fontSize = fontSizeSp.value.sp)
            }
        }
    }
    }
}



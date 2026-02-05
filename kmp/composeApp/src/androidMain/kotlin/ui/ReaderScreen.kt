package com.progressivereader.kmp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkAdd
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.BookState
import com.progressivereader.kmp.offline.Bookmark
import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.reader.HtmlContent
import com.progressivereader.kmp.settings.AppSettings
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(
    bookId: String,
    settings: AppSettings,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    onBack: () -> Unit,
    onSetDarkMode: (Boolean) -> Unit,
    onSetFontSizeSp: (Float) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)

    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var epubBook by remember { mutableStateOf<EpubBook?>(null) }
    var bookState by remember { mutableStateOf(BookState()) }

    var chapterIndex by rememberSaveable(bookId) { mutableStateOf(0) }
    var chapterHtml by remember { mutableStateOf<String?>(null) }
    var chapterBaseUrl by remember { mutableStateOf<String?>(null) }

    var darkMode by remember { mutableStateOf(settings.reader.darkMode) }
    var fontSizeSp by remember { mutableStateOf(settings.reader.fontSizeSp) }

    LaunchedEffect(settings.reader.darkMode, settings.reader.fontSizeSp) {
        darkMode = settings.reader.darkMode
        fontSizeSp = settings.reader.fontSizeSp
    }

    val epubFile = remember(bookId) { bookCache.epubFile(bookId) }
    val extractedDir = remember(bookId) { bookCache.extractedDir(bookId) }

    LaunchedEffect(bookId) {
        isLoading = true
        error = null
        chapterHtml = null
        chapterBaseUrl = null
        epubBook = null
        try {
            if (!epubFile.exists()) {
                error = "Book is not cached."
                return@LaunchedEffect
            }

            epubRepository.extractIfNeeded(epubFile = epubFile, extractedDir = extractedDir)
            val book = epubRepository.loadBook(extractedDir)
            epubBook = book

            val state = bookCache.loadState(bookId)
            bookState = state

            val safeIndex =
                state.lastChapterIndex.coerceIn(0, (book.chapters.lastIndex).coerceAtLeast(0))
            chapterIndex = safeIndex

            bookCache.markOpened(bookId)
        } catch (t: Throwable) {
            error = t.message ?: "Failed to open book"
        } finally {
            isLoading = false
        }
    }

    LaunchedEffect(epubBook, chapterIndex) {
        val book = epubBook ?: return@LaunchedEffect
        val chapter = book.chapters.getOrNull(chapterIndex) ?: return@LaunchedEffect
        chapterHtml = epubRepository.loadChapterHtml(extractedDir, chapter.href)
        chapterBaseUrl = epubRepository.chapterBaseUrl(extractedDir, chapter.href)

        val updated = bookState.copy(lastChapterIndex = chapterIndex)
        bookState = updated
        runCatching { bookCache.saveState(bookId, updated) }
    }

    fun isBookmarkedForCurrentChapter(): Boolean =
        bookState.bookmarks.any { it.chapterIndex == chapterIndex }

    fun toggleBookmark() {
        val now = isoNowUtc()
        val updated =
            if (isBookmarkedForCurrentChapter()) {
                bookState.copy(bookmarks = bookState.bookmarks.filterNot { it.chapterIndex == chapterIndex })
            } else {
                bookState.copy(
                    bookmarks =
                        bookState.bookmarks +
                            Bookmark(chapterIndex = chapterIndex, label = null, createdAt = now),
                )
            }
        bookState = updated
        scope.launch { bookCache.saveState(bookId, updated) }
    }

    val totalChapters = epubBook?.chapters?.size ?: 0
    val maxIdx = (totalChapters - 1).coerceAtLeast(0)

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                DrawerContents(
                    epubBook = epubBook,
                    chapterIndex = chapterIndex,
                    bookmarks = bookState.bookmarks,
                    onSelectChapter = { idx ->
                        chapterIndex = idx
                        scope.launch { drawerState.close() }
                    },
                )
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                text = epubBook?.title ?: "Reader",
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (totalChapters > 0) {
                                Text(
                                    text = "Chapter ${chapterIndex + 1} / $totalChapters",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
                        }
                    },
                    actions = {
                        IconButton(
                            enabled = totalChapters > 0,
                            onClick = { scope.launch { drawerState.open() } },
                        ) { Icon(Icons.Outlined.MenuBook, contentDescription = "TOC") }

                        TextButton(
                            enabled = fontSizeSp > 12f,
                            onClick = {
                                val next = (fontSizeSp - 2f).coerceAtLeast(12f)
                                fontSizeSp = next
                                onSetFontSizeSp(next)
                            },
                        ) { Text("A-") }

                        TextButton(
                            enabled = fontSizeSp < 32f,
                            onClick = {
                                val next = (fontSizeSp + 2f).coerceAtMost(32f)
                                fontSizeSp = next
                                onSetFontSizeSp(next)
                            },
                        ) { Text("A+") }

                        IconButton(
                            onClick = {
                                darkMode = !darkMode
                                onSetDarkMode(darkMode)
                            },
                        ) {
                            Icon(
                                if (darkMode) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                                contentDescription = "Theme",
                            )
                        }

                        IconButton(
                            enabled = totalChapters > 0,
                            onClick = { toggleBookmark() },
                        ) {
                            Icon(
                                if (isBookmarkedForCurrentChapter()) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkAdd,
                                contentDescription = "Bookmark",
                            )
                        }
                    },
                )
            },
            bottomBar = {
                BottomAppBar {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Button(
                            enabled = chapterIndex > 0,
                            onClick = { chapterIndex = (chapterIndex - 1).coerceAtLeast(0) },
                        ) { Text("Previous") }

                        Button(
                            enabled = chapterIndex < maxIdx,
                            onClick = { chapterIndex = (chapterIndex + 1).coerceAtMost(maxIdx) },
                        ) { Text("Next") }
                    }
                }
            },
        ) { padding ->
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                when {
                    isLoading -> CircularProgressIndicator()
                    error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                    epubBook == null -> Text("No book loaded.")
                    else -> {
                        val html = chapterHtml ?: "<p>Loading…</p>"
                        Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
                            HtmlContent(
                                html = html,
                                baseUrl = chapterBaseUrl,
                                darkMode = darkMode,
                                fontSizeSp = fontSizeSp,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DrawerContents(
    epubBook: EpubBook?,
    chapterIndex: Int,
    bookmarks: List<Bookmark>,
    onSelectChapter: (Int) -> Unit,
) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            "Contents",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleMedium,
        )

        if (epubBook == null) {
            Text("Loading…", modifier = Modifier.padding(horizontal = 16.dp))
            return
        }

        epubBook.chapters.forEachIndexed { idx, ch ->
            NavigationDrawerItem(
                label = {
                    Text(
                        text = ch.title.ifBlank { "Chapter ${idx + 1}" },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                selected = idx == chapterIndex,
                onClick = { onSelectChapter(idx) },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }

        HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

        Text(
            "Bookmarks",
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            style = MaterialTheme.typography.titleMedium,
        )

        val unique = bookmarks.distinctBy { it.chapterIndex }.sortedBy { it.chapterIndex }
        if (unique.isEmpty()) {
            Text("No bookmarks yet.", modifier = Modifier.padding(horizontal = 16.dp))
        } else {
            unique.forEach { bm ->
                val idx = bm.chapterIndex
                val label =
                    epubBook.chapters.getOrNull(idx)?.title?.ifBlank { null }
                        ?: "Chapter ${idx + 1}"
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .clickable { onSelectChapter(idx) }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(Icons.Outlined.Bookmark, contentDescription = null)
                    Text(
                        text = label,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (idx == chapterIndex) FontWeight.SemiBold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

private fun isoNowUtc(): String {
    val fmt =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
    return fmt.format(Date())
}

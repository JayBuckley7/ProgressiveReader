package com.progressivereader.kmp.ui

import android.net.Uri
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoFixHigh
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkAdd
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.StopCircle
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.jpdb.JpdbActionsService
import com.progressivereader.kmp.jpdb.JpdbService
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.BookState
import com.progressivereader.kmp.offline.Bookmark
import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.reader.HtmlContent
import com.progressivereader.kmp.reader.JpdbHighlighter
import com.progressivereader.kmp.reader.JpdbTokenCache
import com.progressivereader.kmp.reader.TranslationCache
import com.progressivereader.kmp.reader.SwipeDirection
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.tts.TtsController
import com.progressivereader.kmp.translate.TranslateService
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.jsoup.Jsoup

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(
    bookId: String,
    settings: AppSettings,
    sessionJwt: String?,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onSetTheme: (String) -> Unit,
    onSetFontSizeSp: (Float) -> Unit,
    onSetTtsRate: (Float) -> Unit,
    onSetJpdbHighlightEnabled: (Boolean) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val snackbarHostState = remember { SnackbarHostState() }
    val clipboard = LocalClipboardManager.current
    val isOnline = rememberIsOnline()
    val context = LocalContext.current
    val isCompactTopBar = LocalConfiguration.current.screenWidthDp < 420

    val ttsController = remember { TtsController(context) }
    DisposableEffect(ttsController) { onDispose { ttsController.shutdown() } }
    val ttsReady by ttsController.isReady.collectAsState(initial = false)
    val isSpeaking by ttsController.isSpeaking.collectAsState(initial = false)
    var ttsRate by remember { mutableStateOf(settings.reader.ttsRate) }
    var showTtsSheet by remember { mutableStateOf(false) }

    val bookDir = remember(bookId) { bookCache.bookDir(bookId) }
    val translationCache = remember(bookId) { TranslationCache(bookDir) }
    val jpdbTokenCache = remember(bookId) { JpdbTokenCache(bookDir) }
    val jpdbHighlighter =
        remember(bookId) { JpdbHighlighter(tokenCache = jpdbTokenCache, jpdbService = JpdbService()) }
    val translateService = remember(sessionJwt) { TranslateService(getSessionToken = { sessionJwt }) }
    val jpdbActionsService = remember(sessionJwt) { JpdbActionsService(getSessionToken = { sessionJwt }) }

    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var epubBook by remember { mutableStateOf<EpubBook?>(null) }
    var bookState by remember { mutableStateOf(BookState()) }

    var chapterIndex by rememberSaveable(bookId) { mutableStateOf(0) }
    var chapterBodyHtml by remember { mutableStateOf<String?>(null) }
    var chapterHeadHtml by remember { mutableStateOf("") }
    var chapterSourceHash by remember { mutableStateOf<String?>(null) }
    var chapterBaseUrl by remember { mutableStateOf<String?>(null) }

    var theme by remember { mutableStateOf(settings.reader.theme) }
    var fontSizeSp by remember { mutableStateOf(settings.reader.fontSizeSp) }
    var highlightEnabled by remember { mutableStateOf(settings.reader.jpdbHighlightEnabled) }

    var highlightedBodyHtml by remember { mutableStateOf<String?>(null) }
    var highlightedSourceHash by remember { mutableStateOf<String?>(null) }
    var highlightTokenById by remember { mutableStateOf<Map<String, JpdbService.ProcessedToken>>(emptyMap()) }
    var isApplyingHighlights by remember { mutableStateOf(false) }

    var isTranslated by remember { mutableStateOf(false) }
    var translatedBodyHtml by remember { mutableStateOf<String?>(null) }
    var isTranslating by remember { mutableStateOf(false) }

    var selectedTokenId by remember { mutableStateOf<String?>(null) }
    var isJpdbActionBusy by remember { mutableStateOf(false) }

    var showOverflowMenu by remember(bookId) { mutableStateOf(false) }

    LaunchedEffect(settings.reader.theme, settings.reader.fontSizeSp) {
        theme = settings.reader.theme
        fontSizeSp = settings.reader.fontSizeSp
    }

    LaunchedEffect(settings.reader.ttsRate) {
        ttsRate = settings.reader.ttsRate
        ttsController.setRate(ttsRate)
    }

    LaunchedEffect(settings.reader.jpdbHighlightEnabled) {
        highlightEnabled = settings.reader.jpdbHighlightEnabled
    }

    val darkModeEffective = isDarkThemeMode(theme)

    val epubFile = remember(bookId) { bookCache.epubFile(bookId) }
    val extractedDir = remember(bookId) { bookCache.extractedDir(bookId) }

    LaunchedEffect(bookId) {
        isLoading = true
        error = null
        chapterBodyHtml = null
        chapterHeadHtml = ""
        chapterSourceHash = null
        chapterBaseUrl = null
        epubBook = null
        highlightedBodyHtml = null
        highlightedSourceHash = null
        highlightTokenById = emptyMap()
        isApplyingHighlights = false
        isTranslated = false
        translatedBodyHtml = null
        isTranslating = false
        selectedTokenId = null
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
        val sanitized = epubRepository.loadSanitizedChapterHtml(extractedDir, chapter.href)
        chapterBodyHtml = sanitized?.bodyHtml
        chapterHeadHtml = sanitized?.headHtml ?: ""
        chapterSourceHash = sanitized?.bodyHtml?.let { TranslationCache.sha256Hex(it) }
        chapterBaseUrl = epubRepository.chapterBaseUrl(extractedDir, chapter.href)

        highlightedBodyHtml = null
        highlightedSourceHash = null
        highlightTokenById = emptyMap()
        isApplyingHighlights = false
        isTranslated = false
        translatedBodyHtml = null
        isTranslating = false
        selectedTokenId = null

        val updated = bookState.copy(lastChapterIndex = chapterIndex)
        bookState = updated
        runCatching { bookCache.saveState(bookId, updated) }
    }

    val jpdbApiKey = settings.reader.jpdbApiKey
    val translationTargetLang = settings.reader.translationTargetLang
    val cefrLevel = settings.reader.cefrLevel
    val translatedBodyHash = remember(translatedBodyHtml) { translatedBodyHtml?.let { TranslationCache.sha256Hex(it) } }

    val highlightErrorKey = rememberSaveable(bookId, chapterIndex) { mutableStateOf(false) }
    LaunchedEffect(
        chapterBodyHtml,
        translatedBodyHtml,
        highlightEnabled,
        jpdbApiKey,
        isOnline,
        isTranslated,
    ) {
        if (!highlightEnabled) {
            highlightedBodyHtml = null
            highlightedSourceHash = null
            highlightTokenById = emptyMap()
            highlightErrorKey.value = false
            return@LaunchedEffect
        }

        val body =
            if (isTranslated) {
                translatedBodyHtml
            } else {
                chapterBodyHtml
            } ?: run {
                highlightedBodyHtml = null
                highlightedSourceHash = null
                highlightTokenById = emptyMap()
                return@LaunchedEffect
            }
        val hash = TranslationCache.sha256Hex(body)
        val key = jpdbApiKey?.trim().orEmpty()

        // Ensure we never display stale highlights from a different source.
        if (highlightedSourceHash != null && highlightedSourceHash != hash) {
            highlightedBodyHtml = null
            highlightedSourceHash = null
            highlightTokenById = emptyMap()
        }

        isApplyingHighlights = true
        val result =
            runCatching {
                jpdbHighlighter.highlightChapter(
                    bodyHtml = body,
                    chapterIndex = chapterIndex,
                    sourceHash = hash,
                    jpdbApiKey = key,
                    isOnline = isOnline,
                )
            }.getOrNull()
        isApplyingHighlights = false

        if (result == null) {
            highlightedBodyHtml = null
            highlightedSourceHash = null
            highlightTokenById = emptyMap()
            if (!highlightErrorKey.value) {
                when {
                    key.isBlank() -> {
                        highlightErrorKey.value = true
                        val res =
                            snackbarHostState.showSnackbar(
                                message = "Add a JPDB API key to enable highlights.",
                                actionLabel = "Settings",
                            )
                        if (res == SnackbarResult.ActionPerformed) onOpenSettings()
                    }

                    !isOnline -> {
                        highlightErrorKey.value = true
                        snackbarHostState.showSnackbar("Highlights unavailable offline (not cached).")
                    }
                }
            }
        } else {
            highlightedBodyHtml = result.html
            highlightedSourceHash = hash
            highlightTokenById = result.tokenById
            highlightErrorKey.value = false
        }
    }

    suspend fun handleTranslateClick() {
        val body = chapterBodyHtml ?: return
        val hash = chapterSourceHash ?: return

        if (isTranslated) {
            isTranslated = false
            return
        }

        if (settings.reader.cacheTranslations) {
            val cached =
                translationCache.loadIfValid(
                    chapterIndex = chapterIndex,
                    sourceHash = hash,
                    targetLang = translationTargetLang,
                    useCefr = false,
                    cefrLevel = cefrLevel,
                )
            if (cached != null) {
                translatedBodyHtml = cached.html
                isTranslated = true
                return
            }
        }

        if (!isOnline) {
            snackbarHostState.showSnackbar("Translation requires internet (unless cached).")
            return
        }
        if (sessionJwt.isNullOrBlank()) {
            snackbarHostState.showSnackbar("Sign in to translate.")
            return
        }

        isTranslating = true
        val resp =
            runCatching {
                translateService.translateChapter(
                    TranslateService.ChapterTranslateRequest(
                        content = body,
                        target_lang = translationTargetLang,
                        model = settings.reader.openAiModel,
                        api_key = settings.reader.openAiApiKey?.trim().orEmpty(),
                        use_cefr = false,
                        cefr_level = cefrLevel,
                    ),
                )
            }.getOrNull()
        isTranslating = false

        if (resp == null) {
            snackbarHostState.showSnackbar("Translation failed.")
            return
        }

        val entry =
            com.progressivereader.kmp.reader.TranslationCacheEntry(
                createdAt = TranslationCache.isoNowUtc(),
                targetLang = translationTargetLang,
                useCefr = false,
                cefrLevel = cefrLevel,
                sourceHash = hash,
                html = resp.translated_text,
            )
        if (settings.reader.cacheTranslations) {
            runCatching { translationCache.save(chapterIndex, entry) }
        }
        translatedBodyHtml = entry.html
        isTranslated = true
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

    LaunchedEffect(bookId, chapterIndex) { ttsController.stop() }

    val swipeHintShown = rememberSaveable(bookId) { mutableStateOf(false) }
    LaunchedEffect(epubBook) {
        if (swipeHintShown.value) return@LaunchedEffect
        if ((epubBook?.chapters?.size ?: 0) <= 1) return@LaunchedEffect
        swipeHintShown.value = true
        snackbarHostState.showSnackbar("Tip: swipe left/right to change chapters.")
    }

    val speakSourceHtml =
        when {
            isTranslated -> translatedBodyHtml ?: chapterBodyHtml
            highlightEnabled -> highlightedBodyHtml ?: chapterBodyHtml
            else -> chapterBodyHtml
        }
    val speakText =
        remember(speakSourceHtml) {
            if (speakSourceHtml.isNullOrBlank()) "" else Jsoup.parse(speakSourceHtml).text().trim()
        }

    fun decreaseFontSize() {
        val next = (fontSizeSp - 2f).coerceAtLeast(12f)
        fontSizeSp = next
        onSetFontSizeSp(next)
    }

    fun increaseFontSize() {
        val next = (fontSizeSp + 2f).coerceAtMost(32f)
        fontSizeSp = next
        onSetFontSizeSp(next)
    }

    fun toggleTheme() {
        val next = if (darkModeEffective) "light" else "dark"
        theme = next
        onSetTheme(next)
    }

    fun toggleHighlights() {
        val next = !highlightEnabled
        highlightEnabled = next
        onSetJpdbHighlightEnabled(next)
        if (next && jpdbApiKey.isNullOrBlank()) {
            scope.launch {
                val res =
                    snackbarHostState.showSnackbar(
                        message = "Add a JPDB API key to enable highlights.",
                        actionLabel = "Settings",
                    )
                if (res == SnackbarResult.ActionPerformed) onOpenSettings()
            }
        }
    }

    fun toggleTts() {
        selectedTokenId = null
        showTtsSheet = true
        if (isSpeaking) {
            ttsController.stop()
        } else {
            ttsController.speak(speakText)
        }
    }

    suspend fun updateTokenStateAndRehighlight(tid: String, nextState: List<String>) {
        val body =
            if (isTranslated) {
                translatedBodyHtml
            } else {
                chapterBodyHtml
            } ?: return
        val hash = TranslationCache.sha256Hex(body)
        val cached = jpdbTokenCache.loadIfValid(chapterIndex, hash) ?: return

        val nextStateElement = JsonArray(nextState.map { JsonPrimitive(it) })
        val updated =
            cached.copy(
                createdAt = isoNowUtc(),
                tokens =
                    cached.tokens.map { ct ->
                        if (ct.id != tid) return@map ct
                        val updatedCard = JsonObject(ct.card.toMutableMap().apply { this["state"] = nextStateElement })
                        ct.copy(card = updatedCard)
                    },
            )
        jpdbTokenCache.save(chapterIndex, updated)

        val key = jpdbApiKey?.trim().orEmpty()
        val res =
            jpdbHighlighter.highlightChapter(
                bodyHtml = body,
                chapterIndex = chapterIndex,
                sourceHash = hash,
                jpdbApiKey = key,
                isOnline = isOnline,
            )
        if (res != null) {
            highlightedBodyHtml = res.html
            highlightedSourceHash = hash
            highlightTokenById = res.tokenById
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = false,
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
            snackbarHost = { SnackbarHost(snackbarHostState) },
            topBar = {
                TopAppBar(
                    colors =
                        TopAppBarDefaults.topAppBarColors(
                            containerColor = MaterialTheme.colorScheme.surface,
                            titleContentColor = MaterialTheme.colorScheme.onSurface,
                        ),
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
                        // On compact devices, the full action set is too wide and overlaps the back button.
                        // Keep TOC visible and tuck the rest into an overflow menu.
                        if (isCompactTopBar) {
                            IconButton(
                                enabled = totalChapters > 0,
                                onClick = { scope.launch { drawerState.open() } },
                            ) { Icon(Icons.Outlined.MenuBook, contentDescription = "TOC") }

                            IconButton(onClick = { showOverflowMenu = true }) {
                                Icon(Icons.Outlined.MoreVert, contentDescription = "More")
                            }

                            DropdownMenu(
                                expanded = showOverflowMenu,
                                onDismissRequest = { showOverflowMenu = false },
                            ) {
                                DropdownMenuItem(
                                    text = { Text("A-") },
                                    enabled = fontSizeSp > 12f,
                                    onClick = {
                                        showOverflowMenu = false
                                        decreaseFontSize()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("A+") },
                                    enabled = fontSizeSp < 32f,
                                    onClick = {
                                        showOverflowMenu = false
                                        increaseFontSize()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (darkModeEffective) "Light theme" else "Dark theme") },
                                    onClick = {
                                        showOverflowMenu = false
                                        toggleTheme()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (highlightEnabled) "Disable highlights" else "Enable highlights") },
                                    enabled = chapterBodyHtml != null && !isTranslating,
                                    onClick = {
                                        showOverflowMenu = false
                                        toggleHighlights()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (isTranslated) "Show original" else "Translate") },
                                    enabled = chapterBodyHtml != null && !isApplyingHighlights && !isTranslating,
                                    onClick = {
                                        showOverflowMenu = false
                                        scope.launch { handleTranslateClick() }
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (isSpeaking) "Stop TTS" else "Start TTS") },
                                    enabled = speakText.isNotBlank() && ttsReady,
                                    onClick = {
                                        showOverflowMenu = false
                                        toggleTts()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (isBookmarkedForCurrentChapter()) "Remove bookmark" else "Add bookmark") },
                                    enabled = totalChapters > 0,
                                    onClick = {
                                        showOverflowMenu = false
                                        toggleBookmark()
                                    },
                                )
                            }
                        } else {
                            IconButton(
                                enabled = totalChapters > 0,
                                onClick = { scope.launch { drawerState.open() } },
                            ) { Icon(Icons.Outlined.MenuBook, contentDescription = "TOC") }

                            AppTextButton(
                                text = "A-",
                                enabled = fontSizeSp > 12f,
                                onClick = { decreaseFontSize() },
                            )

                            AppTextButton(
                                text = "A+",
                                enabled = fontSizeSp < 32f,
                                onClick = { increaseFontSize() },
                            )

                            IconButton(onClick = { toggleTheme() }) {
                                Icon(
                                    if (darkModeEffective) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                                    contentDescription = "Theme",
                                )
                            }

                            IconButton(
                                enabled = chapterBodyHtml != null && !isTranslating,
                                onClick = { toggleHighlights() },
                            ) {
                                if (isApplyingHighlights) {
                                    CircularProgressIndicator(
                                        color = MaterialTheme.colorScheme.primary,
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.padding(6.dp),
                                    )
                                } else {
                                    Icon(
                                        Icons.Outlined.AutoFixHigh,
                                        contentDescription = "Highlights",
                                        tint =
                                            if (highlightEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }

                            IconButton(
                                enabled = chapterBodyHtml != null && !isApplyingHighlights && !isTranslating,
                                onClick = { scope.launch { handleTranslateClick() } },
                            ) {
                                if (isTranslating) {
                                    CircularProgressIndicator(
                                        color = MaterialTheme.colorScheme.primary,
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.padding(6.dp),
                                    )
                                } else {
                                    Icon(
                                        Icons.Outlined.Language,
                                        contentDescription = "Translate",
                                        tint =
                                            if (isTranslated) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }

                            IconButton(
                                enabled = speakText.isNotBlank() && ttsReady,
                                onClick = { toggleTts() },
                            ) {
                                Icon(
                                    if (isSpeaking) Icons.Outlined.StopCircle else Icons.Outlined.VolumeUp,
                                    contentDescription = "Text to speech",
                                    tint =
                                        if (isSpeaking) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
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
                        }
                    },
                )
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
                        val baseBody = if (isTranslated) translatedBodyHtml ?: chapterBodyHtml else chapterBodyHtml
                        val baseHash = if (isTranslated) translatedBodyHash ?: chapterSourceHash else chapterSourceHash
                        val canShowHighlights =
                            highlightEnabled &&
                                highlightedBodyHtml != null &&
                                highlightedSourceHash != null &&
                                highlightedSourceHash == baseHash
                        val effectiveBody =
                            when {
                                canShowHighlights -> highlightedBodyHtml
                                else -> baseBody
                            } ?: "<p>Loading…</p>"
                        val html = chapterHeadHtml + effectiveBody
                        Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
                            HtmlContent(
                                html = html,
                                baseUrl = chapterBaseUrl,
                                darkMode = darkModeEffective,
                                fontSizeSp = fontSizeSp,
                                onUrlClick = { url ->
                                    val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return@HtmlContent false
                                    if (uri.scheme != "pr" || uri.host != "jpdb") return@HtmlContent false
                                    val tid = uri.getQueryParameter("tid")?.takeIf { it.isNotBlank() } ?: return@HtmlContent true
                                    if (canShowHighlights && highlightTokenById.containsKey(tid)) {
                                        showTtsSheet = false
                                        selectedTokenId = tid
                                    } else {
                                        scope.launch { snackbarHostState.showSnackbar("No token data for that word.") }
                                    }
                                    true
                                },
                                onSwipe = { direction ->
                                    when (direction) {
                                        SwipeDirection.LEFT -> {
                                            if (chapterIndex < maxIdx) {
                                                chapterIndex = (chapterIndex + 1).coerceAtMost(maxIdx)
                                            } else {
                                                scope.launch { snackbarHostState.showSnackbar("End of book.") }
                                            }
                                        }

                                        SwipeDirection.RIGHT -> {
                                            if (chapterIndex > 0) {
                                                chapterIndex = (chapterIndex - 1).coerceAtLeast(0)
                                            } else {
                                                scope.launch { snackbarHostState.showSnackbar("Start of book.") }
                                            }
                                        }
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showTtsSheet) {
        ModalBottomSheet(
            onDismissRequest = { showTtsSheet = false },
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(
                    text = "Text to speech",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )

                AppMutedText("Speed: ${"%.2f".format(ttsRate)}x")
                Slider(
                    value = ttsRate.coerceIn(0.75f, 1.5f),
                    onValueChange = { next ->
                        val clamped = next.coerceIn(0.75f, 1.5f)
                        ttsRate = clamped
                        ttsController.setRate(clamped)
                    },
                    valueRange = 0.75f..1.5f,
                    onValueChangeFinished = { onSetTtsRate(ttsRate) },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AppTonalButton(
                        text = if (isSpeaking) "Stop" else "Speak",
                        enabled = ttsReady && speakText.isNotBlank(),
                        onClick = {
                            if (isSpeaking) ttsController.stop() else ttsController.speak(speakText)
                        },
                        icon = {
                            Icon(
                                if (isSpeaking) Icons.Outlined.StopCircle else Icons.Outlined.VolumeUp,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                        },
                        modifier = Modifier.weight(1f),
                    )

                    AppOutlineButton(
                        text = "Close",
                        onClick = { showTtsSheet = false },
                    )
                }

                Spacer(Modifier.height(6.dp))
            }
        }
    }

    if (selectedTokenId != null) {
        val token = selectedTokenId?.let { highlightTokenById[it] }
        ModalBottomSheet(
            onDismissRequest = { selectedTokenId = null },
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (token == null) {
                    Text("No token data available.", style = MaterialTheme.typography.bodyMedium)
                    return@ModalBottomSheet
                }

                val cardInfo = token.card.toCardInfo()
                Text(
                    text = cardInfo.spelling ?: "(unknown)",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                if (!cardInfo.reading.isNullOrBlank()) {
                    AppMutedText(cardInfo.reading!!)
                }

                if (cardInfo.meanings.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        cardInfo.meanings.forEach { meaning ->
                            if (!meaning.partOfSpeech.isNullOrBlank()) {
                                AppChip(text = meaning.partOfSpeech!!)
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                meaning.glosses.forEach { gloss ->
                                    Text("• $gloss", style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                } else {
                    AppMutedText("No meanings available.")
                }

                fun JsonElement?.asIntOrNull(): Int? {
                    val primitive = this as? JsonPrimitive ?: return null
                    return primitive.content.toIntOrNull()
                }

                val vid = token.card["vid"].asIntOrNull()
                val sid = token.card["sid"].asIntOrNull()
                val existingState =
                    (token.card["state"] as? JsonArray)
                        ?.mapNotNull { (it as? JsonPrimitive)?.content?.trim()?.takeIf { s -> s.isNotBlank() } }
                        .orEmpty()

                val hasNeverForget = existingState.contains("never-forget")
                val hasBlacklisted = existingState.contains("blacklisted")

                val canUseJpdbActions = isOnline && !jpdbApiKey.isNullOrBlank() && vid != null && sid != null

                AppSectionTitle("JPDB")
                if (!canUseJpdbActions) {
                    AppMutedText("Online + JPDB API key required.")
                } else {
                    val tid = selectedTokenId!!
                    val key = jpdbApiKey!!.trim()

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AppTonalButton(
                            text = "Mine",
                            enabled = !isJpdbActionBusy,
                            onClick = {
                                scope.launch {
                                    isJpdbActionBusy = true
                                    try {
                                        val res =
                                            jpdbActionsService.mineWord(
                                                JpdbActionsService.MineWordRequest(
                                                    vid = vid,
                                                    sid = sid,
                                                    jpdbApiKey = key,
                                                )
                                            )
                                        snackbarHostState.showSnackbar(if (res?.success == true) "Mined word" else "Mine failed")
                                    } finally {
                                        isJpdbActionBusy = false
                                    }
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )

                        AppTonalButton(
                            text = if (hasNeverForget) "Unset never-forget" else "Never forget",
                            enabled = !isJpdbActionBusy,
                            onClick = {
                                scope.launch {
                                    isJpdbActionBusy = true
                                    try {
                                        val nextOn = !hasNeverForget
                                        val res =
                                            jpdbActionsService.updateWordState(
                                                JpdbActionsService.UpdateWordStateRequest(
                                                    vid = vid,
                                                    sid = sid,
                                                    flag = "never-forget",
                                                    state = nextOn,
                                                    jpdbApiKey = key,
                                                )
                                            )
                                        if (res?.success == true) {
                                            val base = (res.newState ?: existingState).toMutableSet()
                                            if (nextOn) base.add("never-forget") else base.remove("never-forget")
                                            updateTokenStateAndRehighlight(tid, base.toList())
                                            snackbarHostState.showSnackbar(if (nextOn) "Marked never-forget" else "Removed never-forget")
                                        } else {
                                            snackbarHostState.showSnackbar("Update failed")
                                        }
                                    } finally {
                                        isJpdbActionBusy = false
                                    }
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AppTonalButton(
                            text = if (hasBlacklisted) "Unblacklist" else "Blacklist",
                            enabled = !isJpdbActionBusy,
                            onClick = {
                                scope.launch {
                                    isJpdbActionBusy = true
                                    try {
                                        val nextOn = !hasBlacklisted
                                        val res =
                                            jpdbActionsService.updateWordState(
                                                JpdbActionsService.UpdateWordStateRequest(
                                                    vid = vid,
                                                    sid = sid,
                                                    flag = "blacklist",
                                                    state = nextOn,
                                                    jpdbApiKey = key,
                                                )
                                            )
                                        if (res?.success == true) {
                                            val base = (res.newState ?: existingState).toMutableSet()
                                            if (nextOn) base.add("blacklisted") else base.remove("blacklisted")
                                            updateTokenStateAndRehighlight(tid, base.toList())
                                            snackbarHostState.showSnackbar(if (nextOn) "Blacklisted" else "Removed blacklist")
                                        } else {
                                            snackbarHostState.showSnackbar("Update failed")
                                        }
                                    } finally {
                                        isJpdbActionBusy = false
                                    }
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )

                        AppTonalButton(
                            text = "Review: Good",
                            enabled = !isJpdbActionBusy,
                            onClick = {
                                scope.launch {
                                    isJpdbActionBusy = true
                                    try {
                                        val res =
                                            jpdbActionsService.reviewCard(
                                                JpdbActionsService.ReviewCardRequest(
                                                    vid = vid,
                                                    sid = sid,
                                                    rating = "good",
                                                    jpdbApiKey = key,
                                                )
                                            )
                                        if (res?.success == true && !res.newState.isNullOrEmpty()) {
                                            updateTokenStateAndRehighlight(tid, res.newState)
                                        }
                                        snackbarHostState.showSnackbar(if (res?.success == true) "Reviewed" else "Review failed")
                                    } finally {
                                        isJpdbActionBusy = false
                                    }
                                }
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppTonalButton(
                        text = "Copy word",
                        enabled = !cardInfo.spelling.isNullOrBlank(),
                        onClick = {
                            cardInfo.spelling?.let { clipboard.setText(AnnotatedString(it)) }
                            scope.launch { snackbarHostState.showSnackbar("Copied word") }
                        },
                    )
                    AppTonalButton(
                        text = "Copy reading",
                        enabled = !cardInfo.reading.isNullOrBlank(),
                        onClick = {
                            cardInfo.reading?.let { clipboard.setText(AnnotatedString(it)) }
                            scope.launch { snackbarHostState.showSnackbar("Copied reading") }
                        },
                    )
                }

                Spacer(Modifier.height(6.dp))
            }
        }
    }
}

private data class CardMeaning(
    val partOfSpeech: String?,
    val glosses: List<String>,
)

private data class CardInfo(
    val spelling: String?,
    val reading: String?,
    val meanings: List<CardMeaning>,
)

private fun JsonObject.toCardInfo(): CardInfo {
    fun JsonElement?.asStringOrNull(): String? =
        (this as? JsonPrimitive)?.content?.trim()?.takeIf { it.isNotBlank() }

    val spelling = this["spelling"].asStringOrNull()
    val reading = this["reading"].asStringOrNull()

    val meanings =
        (this["meanings"] as? JsonArray)
            ?.mapNotNull { el ->
                val obj = el as? JsonObject ?: return@mapNotNull null
                val pos = obj["partOfSpeech"].asStringOrNull()
                val glosses =
                    (obj["glosses"] as? JsonArray)
                        ?.mapNotNull { g -> g.asStringOrNull() }
                        ?.filter { it.isNotBlank() }
                        ?: emptyList()
                if (pos.isNullOrBlank() && glosses.isEmpty()) return@mapNotNull null
                CardMeaning(partOfSpeech = pos, glosses = glosses)
            }
            ?: emptyList()

    return CardInfo(spelling = spelling, reading = reading, meanings = meanings)
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

package com.progressivereader.kmp.ui

import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.domain.reader.Bookmark
import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.HtmlContent
import com.progressivereader.kmp.reader.SwipeDirection
import com.progressivereader.kmp.tts.TtsController
import com.progressivereader.kmp.ui.viewmodels.JpdbTokenUi
import com.progressivereader.kmp.ui.viewmodels.ReaderUiState
import kotlinx.coroutines.launch
import org.jsoup.Jsoup

private enum class JpdbReviewGrade(val label: String, val rating: String, val accent: Color) {
    NOTHING("nothing", "nothing", Color(0xFFEF4444)),
    SOMETHING("something", "something", Color(0xFFFB7185)),
    HARD("hard", "hard", Color(0xFFF97316)),
    OKAY("okay", "good", Color(0xFF34D399)), // JPDB calls this "okay"; backend accepts "good" and maps to grade=okay.
    EASY("easy", "easy", Color(0xFF38BDF8)),
}

@Composable
private fun ReviewGradeButton(
    grade: JpdbReviewGrade,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedButton(
        modifier = modifier,
        enabled = enabled,
        onClick = onClick,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, grade.accent.copy(alpha = if (enabled) 0.9f else 0.35f)),
        colors =
            ButtonDefaults.outlinedButtonColors(
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.55f),
                contentColor = grade.accent,
                disabledContentColor = grade.accent.copy(alpha = 0.4f),
            ),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Text(
            text = grade.label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(
    state: ReaderUiState,
    snackbarHostState: SnackbarHostState,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onSetTheme: (String) -> Unit,
    onSetFontSizeSp: (Float) -> Unit,
    onSetTtsRate: (Float) -> Unit,
    onSelectChapter: (Int) -> Unit,
    onPrevChapter: () -> Unit,
    onNextChapter: () -> Unit,
    onToggleTranslate: () -> Unit,
    onToggleHighlights: () -> Unit,
    onRefineMix: () -> Unit,
    onClearRefineMix: () -> Unit,
    onToggleBookmark: () -> Unit,
    onJpdbMineWord: (tokenId: String, vid: Int, sid: Int) -> Unit,
    onJpdbSetFlag: (tokenId: String, vid: Int, sid: Int, flag: String, enabled: Boolean) -> Unit,
    onJpdbReviewCard: (tokenId: String, vid: Int, sid: Int, rating: String, label: String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    val isCompactTopBar = LocalConfiguration.current.screenWidthDp < 420

    val ttsController = remember { TtsController(context) }
    DisposableEffect(ttsController) { onDispose { ttsController.shutdown() } }

    val ttsReady by ttsController.isReady.collectAsState(initial = false)
    val isSpeaking by ttsController.isSpeaking.collectAsState(initial = false)
    val isPaused by ttsController.isPaused.collectAsState(initial = false)

    var showTtsSheet by remember { mutableStateOf(false) }
    var showOverflowMenu by remember(state.bookId) { mutableStateOf(false) }
    var selectedTokenId by remember { mutableStateOf<String?>(null) }

    var ttsRate by remember { mutableStateOf(state.ttsRate) }
    LaunchedEffect(state.ttsRate) {
        ttsRate = state.ttsRate
        ttsController.setRate(ttsRate)
    }

    val darkModeEffective = isDarkThemeMode(state.theme)

    val totalChapters = state.epubBook?.chapters?.size ?: 0
    val isBookmarkedForCurrentChapter = state.bookState.bookmarks.any { it.chapterIndex == state.chapterIndex }

    val swipeHintShown = rememberSaveable(state.bookId) { mutableStateOf(false) }
    LaunchedEffect(state.epubBook?.chapters?.size) {
        if (swipeHintShown.value) return@LaunchedEffect
        if ((state.epubBook?.chapters?.size ?: 0) <= 1) return@LaunchedEffect
        swipeHintShown.value = true
        snackbarHostState.showSnackbar("Tip: swipe left/right to change chapters.")
    }

    LaunchedEffect(state.bookId, state.chapterIndex) { ttsController.stop() }

    val speakUntranslatedHtml =
        if (state.mixActive) {
            state.mixedBodyHtml ?: state.chapterBodyHtml
        } else {
            state.chapterBodyHtml
        }
    val speakSourceHtml =
        when {
            state.isTranslated -> state.translatedBodyHtml ?: state.chapterBodyHtml
            state.highlightEnabled -> state.highlightedBodyHtml ?: speakUntranslatedHtml
            else -> speakUntranslatedHtml
        }
    val speakText =
        remember(speakSourceHtml) {
            val html = speakSourceHtml
            if (html.isNullOrBlank()) "" else Jsoup.parse(html).text().trim()
        }

    fun decreaseFontSize() {
        val next = (state.fontSizeSp - 2f).coerceAtLeast(12f)
        onSetFontSizeSp(next)
    }

    fun increaseFontSize() {
        val next = (state.fontSizeSp + 2f).coerceAtMost(32f)
        onSetFontSizeSp(next)
    }

    fun toggleTheme() {
        val next = if (darkModeEffective) "light" else "dark"
        onSetTheme(next)
    }

    fun toggleTts() {
        selectedTokenId = null
        showTtsSheet = true
        when {
            isSpeaking -> ttsController.pause()
            isPaused -> ttsController.resume()
            else -> ttsController.speak(speakText)
        }
    }

    val untranslatedBody =
        if (state.mixActive) {
            state.mixedBodyHtml ?: state.chapterBodyHtml
        } else {
            state.chapterBodyHtml
        }
    val untranslatedHash =
        if (state.mixActive) {
            state.mixedSourceHash ?: state.chapterSourceHash
        } else {
            state.chapterSourceHash
        }

    val baseBody = if (state.isTranslated) state.translatedBodyHtml else untranslatedBody
    val baseHash = if (state.isTranslated) state.translatedSourceHash else untranslatedHash

    val canShowHighlights =
        state.highlightEnabled &&
            state.highlightedBodyHtml != null &&
            state.highlightedSourceHash != null &&
            state.highlightedSourceHash == baseHash &&
            state.highlightedForTranslatedMode == state.isTranslated

    val highlightedForDisplay =
        if (canShowHighlights) {
            val marked = state.grammarMarkedBodyHtml
            if (!marked.isNullOrBlank() && state.grammarMarkedSourceHash == state.highlightedSourceHash) {
                marked
            } else {
                state.highlightedBodyHtml
            }
        } else {
            null
        }

    val effectiveBody =
        when {
            highlightedForDisplay != null -> highlightedForDisplay
            else -> baseBody
        } ?: "<p>Loading…</p>"

    val html = state.chapterHeadHtml + effectiveBody

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = false,
        drawerContent = {
            ModalDrawerSheet {
                DrawerContents(
                    epubBook = state.epubBook,
                    chapterIndex = state.chapterIndex,
                    bookmarks = state.bookState.bookmarks,
                    onSelectChapter = { idx ->
                        onSelectChapter(idx)
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
                                text = state.epubBook?.title ?: state.title,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (totalChapters > 0) {
                                Text(
                                    text = "Chapter ${state.chapterIndex + 1} / $totalChapters",
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
                                    enabled = state.fontSizeSp > 12f,
                                    onClick = {
                                        showOverflowMenu = false
                                        decreaseFontSize()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("A+") },
                                    enabled = state.fontSizeSp < 32f,
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
                                    text = { Text(if (state.highlightEnabled) "Disable highlights" else "Enable highlights") },
                                    enabled = state.chapterBodyHtml != null && !state.isTranslating && !state.isApplyingMix && !state.isRefiningMix,
                                    onClick = {
                                        showOverflowMenu = false
                                        onToggleHighlights()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (state.isTranslated) "Show original" else "Translate") },
                                    enabled = state.chapterBodyHtml != null && !state.isApplyingHighlights && !state.isTranslating,
                                    onClick = {
                                        showOverflowMenu = false
                                        onToggleTranslate()
                                    },
                                )
                                if (state.mixEnabled) {
                                    DropdownMenuItem(
                                        text = { Text("Refine mix swaps") },
                                        enabled =
                                            state.mixActive &&
                                                state.isOnline &&
                                                state.hasOpenAiApiKey &&
                                                !state.isApplyingMix &&
                                                !state.isRefiningMix &&
                                                !state.isApplyingHighlights &&
                                                !state.isTranslating,
                                        onClick = {
                                            showOverflowMenu = false
                                            onRefineMix()
                                        },
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Clear refined swaps") },
                                        enabled = state.refinedChoices.isNotEmpty() && !state.isApplyingMix && !state.isRefiningMix,
                                        onClick = {
                                            showOverflowMenu = false
                                            onClearRefineMix()
                                        },
                                    )
                                }
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            when {
                                                isSpeaking -> "Pause TTS"
                                                isPaused -> "Resume TTS"
                                                else -> "Start TTS"
                                            }
                                        )
                                    },
                                    enabled = speakText.isNotBlank() && ttsReady,
                                    onClick = {
                                        showOverflowMenu = false
                                        toggleTts()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (isBookmarkedForCurrentChapter) "Remove bookmark" else "Add bookmark") },
                                    enabled = totalChapters > 0,
                                    onClick = {
                                        showOverflowMenu = false
                                        onToggleBookmark()
                                    },
                                )
                            }
                        } else {
                            IconButton(
                                enabled = totalChapters > 0,
                                onClick = { scope.launch { drawerState.open() } },
                            ) { Icon(Icons.Outlined.MenuBook, contentDescription = "TOC") }

                            AppTextButton(text = "A-", enabled = state.fontSizeSp > 12f, onClick = { decreaseFontSize() })
                            AppTextButton(text = "A+", enabled = state.fontSizeSp < 32f, onClick = { increaseFontSize() })

                            IconButton(onClick = { toggleTheme() }) {
                                Icon(
                                    if (darkModeEffective) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                                    contentDescription = "Theme",
                                )
                            }

                            IconButton(
                                enabled = state.chapterBodyHtml != null && !state.isTranslating && !state.isApplyingMix && !state.isRefiningMix,
                                onClick = { onToggleHighlights() },
                            ) {
                                if (state.isApplyingHighlights) {
                                    CircularProgressIndicator(
                                        color = MaterialTheme.colorScheme.primary,
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.padding(6.dp),
                                    )
                                } else {
                                    Icon(
                                        Icons.Outlined.AutoFixHigh,
                                        contentDescription = "Highlights",
                                        tint = if (state.highlightEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }

                            IconButton(
                                enabled = state.chapterBodyHtml != null && !state.isApplyingHighlights && !state.isTranslating,
                                onClick = { onToggleTranslate() },
                            ) {
                                if (state.isTranslating) {
                                    CircularProgressIndicator(
                                        color = MaterialTheme.colorScheme.primary,
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.padding(6.dp),
                                    )
                                } else {
                                    Icon(
                                        Icons.Outlined.Language,
                                        contentDescription = "Translate",
                                        tint = if (state.isTranslated) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                            }

                            IconButton(
                                enabled = speakText.isNotBlank() && ttsReady,
                                onClick = { toggleTts() },
                            ) {
                                Icon(
                                    when {
                                        isSpeaking -> Icons.Outlined.PauseCircle
                                        isPaused -> Icons.Outlined.PlayCircle
                                        else -> Icons.Outlined.VolumeUp
                                    },
                                    contentDescription = "Text to speech",
                                    tint = if (isSpeaking || isPaused) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                )
                            }

                            IconButton(
                                enabled = totalChapters > 0,
                                onClick = { onToggleBookmark() },
                            ) {
                                Icon(
                                    if (isBookmarkedForCurrentChapter) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkAdd,
                                    contentDescription = "Bookmark",
                                )
                            }

                            val showMixMenu = state.mixEnabled || state.refinedChoices.isNotEmpty()
                            if (showMixMenu) {
                                IconButton(onClick = { showOverflowMenu = true }) {
                                    Icon(Icons.Outlined.MoreVert, contentDescription = "More")
                                }

                                DropdownMenu(
                                    expanded = showOverflowMenu,
                                    onDismissRequest = { showOverflowMenu = false },
                                ) {
                                    DropdownMenuItem(
                                        text = { Text("Mix settings") },
                                        onClick = {
                                            showOverflowMenu = false
                                            onOpenSettings()
                                        },
                                    )

                                    if (state.mixEnabled) {
                                        DropdownMenuItem(
                                            text = { Text("Refine mix swaps") },
                                            enabled =
                                                state.mixActive &&
                                                    state.isOnline &&
                                                    state.hasOpenAiApiKey &&
                                                    !state.isApplyingMix &&
                                                    !state.isRefiningMix &&
                                                    !state.isApplyingHighlights &&
                                                    !state.isTranslating,
                                            onClick = {
                                                showOverflowMenu = false
                                                onRefineMix()
                                            },
                                        )
                                    }

                                    DropdownMenuItem(
                                        text = { Text("Clear refined swaps") },
                                        enabled = state.refinedChoices.isNotEmpty() && !state.isApplyingMix && !state.isRefiningMix,
                                        onClick = {
                                            showOverflowMenu = false
                                            onClearRefineMix()
                                        },
                                    )
                                }
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
                if (state.chapterBodyHtml == null) {
                    CircularProgressIndicator()
                } else {
                    Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
                        HtmlContent(
                            html = html,
                            baseUrl = state.chapterBaseUrl,
                            darkMode = darkModeEffective,
                            fontSizeSp = state.fontSizeSp,
                            onUrlClick = { url ->
                                val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return@HtmlContent false
                                if (uri.scheme != "pr" || uri.host != "jpdb") return@HtmlContent false
                                val tid = uri.getQueryParameter("tid")?.takeIf { it.isNotBlank() } ?: return@HtmlContent true
                                if (canShowHighlights && state.tokenUiById.containsKey(tid)) {
                                    showTtsSheet = false
                                    selectedTokenId = tid
                                } else {
                                    scope.launch { snackbarHostState.showSnackbar("No token data for that word.") }
                                }
                                true
                            },
                            onSwipe = { direction ->
                                when (direction) {
                                    SwipeDirection.LEFT -> onNextChapter()
                                    SwipeDirection.RIGHT -> onPrevChapter()
                                }
                            },
                        )

                        val showBusyOverlay = state.isTranslating || state.isApplyingHighlights || state.isApplyingMix || state.isRefiningMix
                        if (showBusyOverlay) {
                            val label =
                                when {
                                    state.isRefiningMix -> "Refining mix…"
                                    state.isTranslating -> "Translating…"
                                    state.isApplyingHighlights -> "Applying highlights…"
                                    else -> "Applying mix…"
                                }
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.TopCenter,
                            ) {
                                Surface(
                                    shape = MaterialTheme.shapes.large,
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f),
                                    tonalElevation = 2.dp,
                                    modifier = Modifier.padding(top = 10.dp),
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                                        Text(
                                            text = label,
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                    }
                                }
                            }
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
                        text =
                            when {
                                isSpeaking -> "Pause"
                                isPaused -> "Resume"
                                else -> "Speak"
                            },
                        enabled = ttsReady && speakText.isNotBlank(),
                        onClick = {
                            when {
                                isSpeaking -> ttsController.pause()
                                isPaused -> ttsController.resume()
                                else -> ttsController.speak(speakText)
                            }
                        },
                        icon = {
                            Icon(
                                when {
                                    isSpeaking -> Icons.Outlined.PauseCircle
                                    isPaused -> Icons.Outlined.PlayCircle
                                    else -> Icons.Outlined.VolumeUp
                                },
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                        },
                        modifier = Modifier.weight(1f),
                    )

                    AppOutlineButton(
                        text = "Stop",
                        enabled = isSpeaking || isPaused,
                        onClick = { ttsController.stop() },
                    )
                }

                AppOutlineButton(
                    text = "Close",
                    onClick = { showTtsSheet = false },
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(6.dp))
            }
        }
    }

    if (selectedTokenId != null) {
        val token: JpdbTokenUi? = selectedTokenId?.let { state.tokenUiById[it] }
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

                val card = token.card
                Text(
                    text = card.spelling ?: "(unknown)",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                if (!card.reading.isNullOrBlank()) {
                    AppMutedText(card.reading!!)
                }

                if (card.meanings.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        card.meanings.forEach { meaning ->
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

                val vid = token.vid
                val sid = token.sid

                fun Set<String>.hasNeverForget(): Boolean =
                    contains("never-forget") || contains("never_forget") || contains("neverforget")

                val hasNeverForget = token.state.hasNeverForget()
                val hasBlacklisted = token.state.contains("blacklisted")

                val canUseJpdbActions = state.isOnline && state.hasJpdbApiKey && vid != null && sid != null

                AppSectionTitle("JPDB")
                if (!canUseJpdbActions) {
                    AppMutedText("Online + JPDB API key required.")
                } else {
                    val tid = token.id

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AppTonalButton(
                            text = "Add",
                            enabled = !state.isJpdbActionBusy,
                            onClick = { onJpdbMineWord(tid, vid!!, sid!!) },
                            modifier = Modifier.weight(1f),
                        )

                        AppTonalButton(
                            text = if (hasNeverForget) "Unset never-forget" else "Never forget",
                            enabled = !state.isJpdbActionBusy,
                            onClick = { onJpdbSetFlag(tid, vid!!, sid!!, "never-forget", !hasNeverForget) },
                            modifier = Modifier.weight(1f),
                        )
                    }

                    AppTonalButton(
                        text = if (hasBlacklisted) "Unblacklist" else "Blacklist",
                        enabled = !state.isJpdbActionBusy,
                        onClick = { onJpdbSetFlag(tid, vid!!, sid!!, "blacklist", !hasBlacklisted) },
                        modifier = Modifier.fillMaxWidth(),
                    )

                    AppMutedText("Review")

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ReviewGradeButton(
                            grade = JpdbReviewGrade.NOTHING,
                            enabled = !state.isJpdbActionBusy,
                            onClick = { onJpdbReviewCard(tid, vid!!, sid!!, JpdbReviewGrade.NOTHING.rating, JpdbReviewGrade.NOTHING.label) },
                            modifier = Modifier.weight(1f),
                        )
                        ReviewGradeButton(
                            grade = JpdbReviewGrade.SOMETHING,
                            enabled = !state.isJpdbActionBusy,
                            onClick = { onJpdbReviewCard(tid, vid!!, sid!!, JpdbReviewGrade.SOMETHING.rating, JpdbReviewGrade.SOMETHING.label) },
                            modifier = Modifier.weight(1f),
                        )
                        ReviewGradeButton(
                            grade = JpdbReviewGrade.HARD,
                            enabled = !state.isJpdbActionBusy,
                            onClick = { onJpdbReviewCard(tid, vid!!, sid!!, JpdbReviewGrade.HARD.rating, JpdbReviewGrade.HARD.label) },
                            modifier = Modifier.weight(1f),
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ReviewGradeButton(
                            grade = JpdbReviewGrade.OKAY,
                            enabled = !state.isJpdbActionBusy,
                            onClick = { onJpdbReviewCard(tid, vid!!, sid!!, JpdbReviewGrade.OKAY.rating, JpdbReviewGrade.OKAY.label) },
                            modifier = Modifier.weight(1f),
                        )
                        ReviewGradeButton(
                            grade = JpdbReviewGrade.EASY,
                            enabled = !state.isJpdbActionBusy,
                            onClick = { onJpdbReviewCard(tid, vid!!, sid!!, JpdbReviewGrade.EASY.rating, JpdbReviewGrade.EASY.label) },
                            modifier = Modifier.weight(1f),
                        )
                    }

                    if (state.isJpdbActionBusy) {
                        AppMutedText("Processing…")
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppTonalButton(
                        text = "Copy word",
                        enabled = !card.spelling.isNullOrBlank(),
                        onClick = {
                            card.spelling?.let { clipboard.setText(AnnotatedString(it)) }
                            scope.launch { snackbarHostState.showSnackbar("Copied word") }
                        },
                    )
                    AppTonalButton(
                        text = "Copy reading",
                        enabled = !card.reading.isNullOrBlank(),
                        onClick = {
                            card.reading?.let { clipboard.setText(AnnotatedString(it)) }
                            scope.launch { snackbarHostState.showSnackbar("Copied reading") }
                        },
                    )
                }

                Spacer(Modifier.height(6.dp))
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

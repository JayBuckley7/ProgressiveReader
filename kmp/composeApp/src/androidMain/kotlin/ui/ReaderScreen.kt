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
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.Tune
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
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.domain.reader.Bookmark
import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.HtmlDocumentSpec
import com.progressivereader.kmp.reader.HtmlPresentationSpec
import com.progressivereader.kmp.reader.HtmlContent
import com.progressivereader.kmp.reader.SwipeDirection
import com.progressivereader.kmp.tts.TtsController
import com.progressivereader.kmp.ui.viewmodels.JpdbTokenUi
import com.progressivereader.kmp.ui.viewmodels.ReaderUiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.jsoup.Jsoup

private enum class JpdbReviewGrade(val label: String, val rating: String) {
    NOTHING("nothing", "nothing"),
    SOMETHING("something", "something"),
    HARD("hard", "hard"),
    OKAY("okay", "good"),
    EASY("easy", "easy"),
}

@Composable
private fun ReviewGradeButton(
    grade: JpdbReviewGrade,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent =
        when (grade) {
            JpdbReviewGrade.NOTHING -> androidx.compose.ui.graphics.Color(0xFFEF4444)
            JpdbReviewGrade.SOMETHING -> androidx.compose.ui.graphics.Color(0xFFFB7185)
            JpdbReviewGrade.HARD -> androidx.compose.ui.graphics.Color(0xFFF97316)
            JpdbReviewGrade.OKAY -> androidx.compose.ui.graphics.Color(0xFF34D399)
            JpdbReviewGrade.EASY -> androidx.compose.ui.graphics.Color(0xFF38BDF8)
        }

    OutlinedButton(
        modifier = modifier,
        enabled = enabled,
        onClick = onClick,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, accent.copy(alpha = if (enabled) 0.85f else 0.35f)),
        colors =
            ButtonDefaults.outlinedButtonColors(
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.65f),
                contentColor = accent,
                disabledContentColor = accent.copy(alpha = 0.4f),
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

    val ttsController = remember { TtsController(context) }
    DisposableEffect(ttsController) { onDispose { ttsController.shutdown() } }

    val ttsReady by ttsController.isReady.collectAsState(initial = false)
    val isSpeaking by ttsController.isSpeaking.collectAsState(initial = false)
    val isPaused by ttsController.isPaused.collectAsState(initial = false)

    var showQuickSettingsSheet by remember { mutableStateOf(false) }
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
        } ?: "<p>Loading...</p>"

    val chapterKey = "${state.bookId}:${state.chapterIndex}"
    val contentKey = "$chapterKey:${state.chapterHeadHtml.hashCode()}:${effectiveBody.hashCode()}"

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
                ReaderTopBar(
                    title = state.epubBook?.title ?: state.title,
                    subtitle = if (totalChapters > 0) "Chapter ${state.chapterIndex + 1} of $totalChapters" else null,
                    isBusy = state.isTranslating || state.isApplyingHighlights || state.isApplyingMix || state.isRefiningMix,
                    onBack = onBack,
                    canOpenContents = totalChapters > 0,
                    onOpenContents = { scope.launch { drawerState.open() } },
                    onOpenQuickSettings = {
                        selectedTokenId = null
                        showQuickSettingsSheet = true
                    },
                    onOpenOverflow = { showOverflowMenu = true },
                    overflowMenu = {
                        DropdownMenu(
                            expanded = showOverflowMenu,
                            onDismissRequest = { showOverflowMenu = false },
                        ) {
                            DropdownMenuItem(
                                text = { Text("Advanced settings") },
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
                            if (state.refinedChoices.isNotEmpty()) {
                                DropdownMenuItem(
                                    text = { Text("Clear refined swaps") },
                                    enabled = !state.isApplyingMix && !state.isRefiningMix,
                                    onClick = {
                                        showOverflowMenu = false
                                        onClearRefineMix()
                                    },
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
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ReaderBusyIndicator(
                    isTranslated = state.isTranslated,
                    highlightsVisible = canShowHighlights,
                    mixActive = state.mixActive,
                    isBusy = state.isTranslating || state.isApplyingHighlights || state.isApplyingMix || state.isRefiningMix,
                    busyLabel =
                        when {
                            state.isRefiningMix -> "Refining mix..."
                            state.isTranslating -> "Translating..."
                            state.isApplyingHighlights -> "Refreshing highlights..."
                            state.isApplyingMix -> "Applying mix..."
                            else -> null
                        },
                )

                if (state.chapterBodyHtml == null) {
                    Box(
                        modifier = Modifier.fillMaxWidth().weight(1f),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                } else {
                    ReaderBody(
                        modifier = Modifier.fillMaxWidth().weight(1f),
                        document =
                            HtmlDocumentSpec(
                                bodyHtml = effectiveBody,
                                headHtml = state.chapterHeadHtml,
                                baseUrl = state.chapterBaseUrl,
                                chapterKey = chapterKey,
                                contentKey = contentKey,
                            ),
                        presentation =
                            HtmlPresentationSpec(
                                darkMode = darkModeEffective,
                                fontSizeSp = state.fontSizeSp,
                            ),
                        onUrlClick = { url ->
                            val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return@ReaderBody false
                            if (uri.scheme != "pr" || uri.host != "jpdb") return@ReaderBody false
                            val tid = uri.getQueryParameter("tid")?.takeIf { it.isNotBlank() } ?: return@ReaderBody true
                            if (canShowHighlights && state.tokenUiById.containsKey(tid)) {
                                showQuickSettingsSheet = false
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
                }
            }
        }
    }

    if (showQuickSettingsSheet) {
        ReaderQuickSettingsSheet(
            state = state,
            darkModeEffective = darkModeEffective,
            totalChapters = totalChapters,
            isBookmarkedForCurrentChapter = isBookmarkedForCurrentChapter,
            ttsRate = ttsRate,
            ttsReady = ttsReady,
            isSpeaking = isSpeaking,
            isPaused = isPaused,
            speakText = speakText,
            onDismiss = { showQuickSettingsSheet = false },
            onAdvancedSettings = {
                showQuickSettingsSheet = false
                onOpenSettings()
            },
            onDecreaseFontSize = { decreaseFontSize() },
            onIncreaseFontSize = { increaseFontSize() },
            onToggleTheme = { toggleTheme() },
            onToggleTranslate = onToggleTranslate,
            onToggleHighlights = onToggleHighlights,
            onToggleBookmark = onToggleBookmark,
            onTtsRateChange = { next ->
                val clamped = next.coerceIn(0.75f, 1.5f)
                ttsRate = clamped
                ttsController.setRate(clamped)
            },
            onTtsRateCommit = { onSetTtsRate(ttsRate) },
            onToggleTts = {
                when {
                    isSpeaking -> ttsController.pause()
                    isPaused -> ttsController.resume()
                    else -> ttsController.speak(speakText)
                }
            },
            onStopTts = { ttsController.stop() },
        )
    }

    if (selectedTokenId != null) {
        ReaderTokenSheet(
            token = selectedTokenId?.let { state.tokenUiById[it] },
            state = state,
            clipboard = clipboard,
            snackbarHostState = snackbarHostState,
            onDismiss = { selectedTokenId = null },
            onJpdbMineWord = onJpdbMineWord,
            onJpdbSetFlag = onJpdbSetFlag,
            onJpdbReviewCard = onJpdbReviewCard,
            scope = scope,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReaderTopBar(
    title: String,
    subtitle: String?,
    isBusy: Boolean,
    onBack: () -> Unit,
    canOpenContents: Boolean,
    onOpenContents: () -> Unit,
    onOpenQuickSettings: () -> Unit,
    onOpenOverflow: () -> Unit,
    overflowMenu: @Composable () -> Unit,
) {
    AppShellTopBar(
        title = title,
        subtitle = subtitle,
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
            }
        },
        actions = {
            if (isBusy) {
                CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(18.dp).padding(end = 2.dp),
                )
            }
            IconButton(enabled = canOpenContents, onClick = onOpenContents) {
                Icon(Icons.Outlined.MenuBook, contentDescription = "Contents")
            }
            IconButton(onClick = onOpenQuickSettings) {
                Icon(Icons.Outlined.Tune, contentDescription = "Quick settings")
            }
            Box {
                IconButton(onClick = onOpenOverflow) {
                    Icon(Icons.Outlined.MoreVert, contentDescription = "More")
                }
                overflowMenu()
            }
        },
    )
}

@Composable
private fun ReaderBusyIndicator(
    isTranslated: Boolean,
    highlightsVisible: Boolean,
    mixActive: Boolean,
    isBusy: Boolean,
    busyLabel: String?,
) {
    val chips =
        buildList {
            if (mixActive) add("Mix")
            if (highlightsVisible) add("Highlights")
            if (isTranslated) add("Translated")
        }
    if (!isBusy && chips.isEmpty()) return

    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.58f),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (isBusy && !busyLabel.isNullOrBlank()) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                Text(busyLabel, style = MaterialTheme.typography.bodySmall)
            } else {
                AppMutedText("Reader ready")
            }
            Spacer(Modifier.weight(1f))
            chips.forEach { label -> AppChip(text = label) }
        }
    }
}

@Composable
private fun ReaderBody(
    modifier: Modifier = Modifier,
    document: HtmlDocumentSpec,
    presentation: HtmlPresentationSpec,
    onUrlClick: (String) -> Boolean,
    onSwipe: ((SwipeDirection) -> Unit)?,
) {
    Box(modifier = modifier) {
        HtmlContent(
            document = document,
            presentation = presentation,
            onUrlClick = onUrlClick,
            onSwipe = onSwipe,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReaderQuickSettingsSheet(
    state: ReaderUiState,
    darkModeEffective: Boolean,
    totalChapters: Int,
    isBookmarkedForCurrentChapter: Boolean,
    ttsRate: Float,
    ttsReady: Boolean,
    isSpeaking: Boolean,
    isPaused: Boolean,
    speakText: String,
    onDismiss: () -> Unit,
    onAdvancedSettings: () -> Unit,
    onDecreaseFontSize: () -> Unit,
    onIncreaseFontSize: () -> Unit,
    onToggleTheme: () -> Unit,
    onToggleTranslate: () -> Unit,
    onToggleHighlights: () -> Unit,
    onToggleBookmark: () -> Unit,
    onTtsRateChange: (Float) -> Unit,
    onTtsRateCommit: () -> Unit,
    onToggleTts: () -> Unit,
    onStopTts: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            AppSectionHeader(
                title = "Reader controls",
                subtitle = if (totalChapters > 0) "Keep the page clear and bring controls in only when needed." else null,
            )

            AppSectionSurface(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppSectionHeader(title = "Appearance")
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        AppOutlineButton(
                            text = "A-",
                            enabled = state.fontSizeSp > 12f,
                            onClick = onDecreaseFontSize,
                            modifier = Modifier.weight(1f),
                        )
                        AppOutlineButton(
                            text = "A+",
                            enabled = state.fontSizeSp < 32f,
                            onClick = onIncreaseFontSize,
                            modifier = Modifier.weight(1f),
                        )
                        AppTonalButton(
                            text = if (darkModeEffective) "Light" else "Dark",
                            onClick = onToggleTheme,
                            modifier = Modifier.weight(1f),
                            icon = {
                                Icon(
                                    if (darkModeEffective) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                            },
                        )
                    }
                    AppMutedText("Font size ${state.fontSizeSp.toInt()}sp")
                }
            }

            AppSectionSurface(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppSectionHeader(title = "Reading")
                    ReaderToggleRow(
                        title = if (state.isTranslated) "Show original" else "Translate",
                        checked = state.isTranslated,
                        enabled = state.chapterBodyHtml != null && !state.isApplyingHighlights && !state.isTranslating,
                        onToggle = onToggleTranslate,
                    )
                    ReaderToggleRow(
                        title = "Highlights",
                        checked = state.highlightEnabled,
                        enabled = state.chapterBodyHtml != null && !state.isTranslating && !state.isApplyingMix && !state.isRefiningMix,
                        onToggle = onToggleHighlights,
                    )
                    ReaderToggleRow(
                        title = if (isBookmarkedForCurrentChapter) "Bookmarked" else "Bookmark chapter",
                        checked = isBookmarkedForCurrentChapter,
                        enabled = totalChapters > 0,
                        onToggle = onToggleBookmark,
                    )
                }
            }

            AppSectionSurface(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppSectionHeader(title = "Text to speech")
                    AppMutedText("Speed ${"%.2f".format(ttsRate)}x")
                    Slider(
                        value = ttsRate.coerceIn(0.75f, 1.5f),
                        onValueChange = onTtsRateChange,
                        valueRange = 0.75f..1.5f,
                        onValueChangeFinished = onTtsRateCommit,
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
                            onClick = onToggleTts,
                            modifier = Modifier.weight(1f),
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
                        )
                        AppOutlineButton(
                            text = "Stop",
                            enabled = isSpeaking || isPaused,
                            onClick = onStopTts,
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppOutlineButton(
                    text = "Advanced settings",
                    onClick = onAdvancedSettings,
                    modifier = Modifier.weight(1f),
                )
                AppTonalButton(
                    text = "Close",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
            }

            Spacer(Modifier.height(6.dp))
        }
    }
}

@Composable
private fun ReaderToggleRow(
    title: String,
    checked: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Switch(
            checked = checked,
            enabled = enabled,
            onCheckedChange = { onToggle() },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReaderTokenSheet(
    token: JpdbTokenUi?,
    state: ReaderUiState,
    clipboard: ClipboardManager,
    snackbarHostState: SnackbarHostState,
    onDismiss: () -> Unit,
    onJpdbMineWord: (tokenId: String, vid: Int, sid: Int) -> Unit,
    onJpdbSetFlag: (tokenId: String, vid: Int, sid: Int, flag: String, enabled: Boolean) -> Unit,
    onJpdbReviewCard: (tokenId: String, vid: Int, sid: Int, rating: String, label: String) -> Unit,
    scope: CoroutineScope,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
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

            AppSectionSurface(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppSectionHeader(title = "Meaning")
                    if (card.meanings.isNotEmpty()) {
                        card.meanings.forEach { meaning ->
                            if (!meaning.partOfSpeech.isNullOrBlank()) {
                                AppChip(text = meaning.partOfSpeech!!)
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                meaning.glosses.forEach { gloss ->
                                    Text("- $gloss", style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    } else {
                        AppMutedText("No meanings available.")
                    }
                }
            }

            val vid = token.vid
            val sid = token.sid

            fun Set<String>.hasNeverForget(): Boolean =
                contains("never-forget") || contains("never_forget") || contains("neverforget")

            val hasNeverForget = token.state.hasNeverForget()
            val hasBlacklisted = token.state.contains("blacklisted")
            val canUseJpdbActions = state.isOnline && state.hasJpdbApiKey && vid != null && sid != null

            AppSectionSurface(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppSectionHeader(title = "JPDB")
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
                            AppMutedText("Processing...")
                        }
                    }
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
                .padding(vertical = 12.dp, horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        AppSectionHeader(
            title = "Contents",
            subtitle = epubBook?.chapters?.size?.let { "$it chapters" } ?: "Loading",
        )

        if (epubBook == null) {
            Text("Loading...", modifier = Modifier.padding(horizontal = 4.dp))
            return
        }

        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            epubBook.chapters.forEachIndexed { idx, ch ->
                NavigationDrawerItem(
                    label = {
                        Text(
                            text = ch.title.ifBlank { "Chapter ${idx + 1}" },
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    selected = idx == chapterIndex,
                    onClick = { onSelectChapter(idx) },
                )
            }
        }

        HorizontalDivider()
        AppSectionHeader(title = "Bookmarks", subtitle = "${bookmarks.distinctBy { it.chapterIndex }.size} saved")

        val unique = bookmarks.distinctBy { it.chapterIndex }.sortedBy { it.chapterIndex }
        if (unique.isEmpty()) {
            AppMutedText("No bookmarks yet.")
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
                            .padding(vertical = 8.dp),
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

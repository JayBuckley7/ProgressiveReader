package com.progressivereader.kmp.ui

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.viewmodel.compose.viewModel
import com.progressivereader.kmp.logging.AppLog
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.ui.viewmodels.ReaderEvent
import com.progressivereader.kmp.ui.viewmodels.ReaderEventAction
import com.progressivereader.kmp.ui.viewmodels.ReaderUiState
import com.progressivereader.kmp.ui.viewmodels.ReaderViewModel
import com.progressivereader.kmp.ui.viewmodels.ReaderViewModelFactory

@Composable
fun ReaderRoute(
    bookId: String,
    settings: AppSettings,
    sessionJwt: String?,
    viewModelFactory: ReaderViewModelFactory,
    bookCache: BookCache,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onSetTheme: (String) -> Unit,
    onSetFontSizeSp: (Float) -> Unit,
    onSetTtsRate: (Float) -> Unit,
    onSetJpdbHighlightEnabled: (Boolean) -> Unit,
) {
    val vm: ReaderViewModel = viewModel(factory = viewModelFactory)
    val state by vm.state.collectAsState()

    val effectiveBookId = state.bookId ?: bookId.trim()

    val isOnline = rememberIsOnline()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(isOnline, sessionJwt, settings.reader) {
        vm.updateEnvironment(
            isOnline = isOnline,
            sessionJwt = sessionJwt,
            settings = settings.reader,
        )
    }

    LaunchedEffect(bookId) {
        vm.open(bookId)
    }

    LaunchedEffect(Unit) {
        vm.events.collect { ev ->
            when (ev) {
                is ReaderEvent.PersistHighlightEnabled -> onSetJpdbHighlightEnabled(ev.enabled)
                is ReaderEvent.Snackbar -> {
                    AppLog.i("Reader", "Snackbar: ${ev.message}")
                    val res =
                        if (ev.actionLabel.isNullOrBlank()) {
                            snackbarHostState.showSnackbar(ev.message)
                        } else {
                            snackbarHostState.showSnackbar(message = ev.message, actionLabel = ev.actionLabel)
                        }
                    if (res == androidx.compose.material3.SnackbarResult.ActionPerformed && ev.action == ReaderEventAction.OpenSettings) {
                        onOpenSettings()
                    }
                }
            }
        }
    }

    ReaderHostScreen(
        state = state,
        onBack = onBack,
        pdfContent = {
            PdfReaderScreen(
                bookId = effectiveBookId,
                title = state.title,
                settings = settings,
                bookCache = bookCache,
                onBack = onBack,
                onOpenSettings = onOpenSettings,
                onSetTtsRate = onSetTtsRate,
            )
        },
        txtContent = {
            TextReaderScreen(
                bookId = effectiveBookId,
                title = state.title,
                settings = settings,
                bookCache = bookCache,
                onBack = onBack,
                onOpenSettings = onOpenSettings,
            )
        },
        epubContent = {
            ReaderScreen(
                state = state,
                snackbarHostState = snackbarHostState,
                onBack = onBack,
                onOpenSettings = onOpenSettings,
                onSetTheme = onSetTheme,
                onSetFontSizeSp = onSetFontSizeSp,
                onSetTtsRate = onSetTtsRate,
                onSelectChapter = { idx -> vm.selectChapter(idx) },
                onPrevChapter = { vm.prevChapter() },
                onNextChapter = { vm.nextChapter() },
                onToggleTranslate = { vm.toggleTranslate() },
                onToggleHighlights = { vm.toggleHighlights() },
                onRefineMix = { vm.refineMix() },
                onClearRefineMix = { vm.clearRefineMix() },
                onToggleBookmark = { vm.toggleBookmark() },
                onJpdbMineWord = { tokenId, vid, sid -> vm.jpdbMineWord(tokenId, vid, sid) },
                onJpdbSetFlag = { tokenId, vid, sid, flag, enabled -> vm.jpdbSetFlag(tokenId, vid, sid, flag, enabled) },
                onJpdbReviewCard = { tokenId, vid, sid, rating, label -> vm.jpdbReviewCard(tokenId, vid, sid, rating, label) },
            )
        },
    )
}

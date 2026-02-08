package com.progressivereader.kmp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.AutoFixHigh
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Style
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import com.clerk.api.Clerk
import com.progressivereader.kmp.navigation.Navigator
import com.progressivereader.kmp.navigation.Screen
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.ui.viewmodels.LibraryViewModelFactory
import com.progressivereader.kmp.ui.viewmodels.ReaderViewModelFactory
import kotlinx.coroutines.launch

@Composable
fun AppRoot(
    navigator: Navigator,
    settings: AppSettings,
    sessionJwt: String?,
    libraryViewModelFactory: LibraryViewModelFactory,
    readerViewModelFactory: ReaderViewModelFactory,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    onSetSessionJwt: suspend (String?) -> Unit,
    onUpdateReaderTheme: suspend (String) -> Unit,
    onUpdateReaderFontSizeSp: suspend (Float) -> Unit,
    onUpdateReaderTtsRate: suspend (Float) -> Unit,
    onUpdateReaderOpenAiApiKey: suspend (String?) -> Unit,
    onUpdateReaderOpenAiModel: suspend (String) -> Unit,
    onUpdateReaderCacheTranslations: suspend (Boolean) -> Unit,
    onUpdateReaderUiLanguage: suspend (String) -> Unit,
    onUpdateReaderJpdbApiKey: suspend (String?) -> Unit,
    onUpdateReaderCefrLevel: suspend (String) -> Unit,
    onUpdateReaderJpdbHighlightEnabled: suspend (Boolean) -> Unit,
    onUpdateReaderTranslationTargetLang: suspend (String) -> Unit,
    onUpdateReaderMixEnabled: suspend (Boolean) -> Unit,
    onUpdateReaderMixAggression: suspend (Float) -> Unit,
    onUpdateReaderMixAutoEnableHighlight: suspend (Boolean) -> Unit,
    onUpdateReaderMixBackupMirrorToDrive: suspend (Boolean) -> Unit,
    onResetDriveOverrides: suspend () -> Unit,
) {
    val scope = rememberCoroutineScope()

    // Integrate Android system back with our in-app navigation stack.
    BackHandler(enabled = navigator.canPop()) { navigator.pop() }

    when (val s = navigator.current) {
        Screen.Library ->
            LibraryRoute(
                settings = settings,
                sessionJwt = sessionJwt,
                viewModelFactory = libraryViewModelFactory,
                onOpenReader = { bookId -> navigator.push(Screen.Reader(bookId)) },
                onOpenSettings = { navigator.reset(Screen.Settings(showBack = false)) },
                onOpenLogin = { navigator.push(Screen.Login(autoStartSignIn = true)) },
                bottomBar = { AppBottomBar(current = Screen.Library, onSelect = { navigator.reset(it) }) },
            )

        Screen.Vocabulary ->
            VocabularyScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                onOpenLogin = { navigator.push(Screen.Login(autoStartSignIn = true)) },
                bottomBar = { AppBottomBar(current = Screen.Vocabulary, onSelect = { navigator.reset(it) }) },
            )

        Screen.Clipboard ->
            ClipboardScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                onOpenLogin = { navigator.push(Screen.Login(autoStartSignIn = true)) },
                bottomBar = { AppBottomBar(current = Screen.Clipboard, onSelect = { navigator.reset(it) }) },
            )

        Screen.Grammar ->
            GrammarScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                bookCache = bookCache,
                epubRepository = epubRepository,
                showBack = false,
                onBack = { navigator.pop() },
                bottomBar = { AppBottomBar(current = Screen.Grammar, onSelect = { navigator.reset(it) }) },
            )

        is Screen.Login ->
            LoginScreen(
                onBack = { navigator.pop() },
                onContinueAsGuest = {
                    scope.launch {
                        onSetSessionJwt(null)
                        navigator.reset(Screen.Library)
                    }
                },
                onSignedIn = { jwt ->
                    scope.launch {
                        onSetSessionJwt(jwt)
                        navigator.reset(Screen.Library)
                    }
                },
                autoStartSignIn = s.autoStartSignIn,
            )

        is Screen.Reader ->
            ReaderRoute(
                bookId = s.bookId,
                settings = settings,
                sessionJwt = sessionJwt,
                viewModelFactory = readerViewModelFactory,
                bookCache = bookCache,
                onBack = {
                    if (navigator.canPop()) navigator.pop() else navigator.reset(Screen.Library)
                },
                onOpenSettings = { navigator.push(Screen.Settings(showBack = true)) },
                onSetTheme = { theme -> scope.launch { onUpdateReaderTheme(theme) } },
                onSetFontSizeSp = { sp -> scope.launch { onUpdateReaderFontSizeSp(sp) } },
                onSetTtsRate = { rate -> scope.launch { onUpdateReaderTtsRate(rate) } },
                onSetJpdbHighlightEnabled = { enabled -> scope.launch { onUpdateReaderJpdbHighlightEnabled(enabled) } },
            )

        is Screen.Settings ->
            SettingsScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                showBack = s.showBack,
                onBack = { navigator.pop() },
                onUpdateReaderTheme = { theme -> scope.launch { onUpdateReaderTheme(theme) } },
                onUpdateReaderFontSizeSp = { sp -> scope.launch { onUpdateReaderFontSizeSp(sp) } },
                onUpdateReaderTtsRate = { rate -> scope.launch { onUpdateReaderTtsRate(rate) } },
                onUpdateReaderOpenAiApiKey = { key -> scope.launch { onUpdateReaderOpenAiApiKey(key) } },
                onUpdateReaderOpenAiModel = { model -> scope.launch { onUpdateReaderOpenAiModel(model) } },
                onUpdateReaderCacheTranslations = { enabled -> scope.launch { onUpdateReaderCacheTranslations(enabled) } },
                onUpdateReaderUiLanguage = { lang -> scope.launch { onUpdateReaderUiLanguage(lang) } },
                onUpdateReaderJpdbApiKey = { key -> scope.launch { onUpdateReaderJpdbApiKey(key) } },
                onUpdateReaderCefrLevel = { level -> scope.launch { onUpdateReaderCefrLevel(level) } },
                onUpdateReaderJpdbHighlightEnabled = { enabled -> scope.launch { onUpdateReaderJpdbHighlightEnabled(enabled) } },
                onUpdateReaderTranslationTargetLang = { lang -> scope.launch { onUpdateReaderTranslationTargetLang(lang) } },
                onUpdateReaderMixEnabled = { enabled -> scope.launch { onUpdateReaderMixEnabled(enabled) } },
                onUpdateReaderMixAggression = { value -> scope.launch { onUpdateReaderMixAggression(value) } },
                onUpdateReaderMixAutoEnableHighlight = { enabled -> scope.launch { onUpdateReaderMixAutoEnableHighlight(enabled) } },
                onUpdateReaderMixBackupMirrorToDrive = { enabled -> scope.launch { onUpdateReaderMixBackupMirrorToDrive(enabled) } },
                onOpenLogin = { navigator.push(Screen.Login(autoStartSignIn = true)) },
                onSignOut = {
                    scope.launch {
                        runCatching { Clerk.signOut() }
                        onSetSessionJwt(null)
                        navigator.reset(Screen.Library)
                    }
                },
                onResetDriveOverrides = { scope.launch { onResetDriveOverrides() } },
                bottomBar =
                    if (s.showBack) {
                        null
                    } else {
                        { AppBottomBar(current = Screen.Settings(showBack = false), onSelect = { navigator.reset(it) }) }
                    },
            )
    }
}

@Composable
private fun AppBottomBar(
    current: Screen,
    onSelect: (Screen) -> Unit,
) {
    fun select(screen: Screen) {
        if (screen == current) return
        onSelect(screen)
    }

    NavigationBar {
        NavigationBarItem(
            selected = current is Screen.Library,
            onClick = { select(Screen.Library) },
            icon = { Icon(Icons.Outlined.MenuBook, contentDescription = "Library") },
            label = { Text("Library") },
        )
        NavigationBarItem(
            selected = current is Screen.Vocabulary,
            onClick = { select(Screen.Vocabulary) },
            icon = { Icon(Icons.Outlined.Style, contentDescription = "Vocabulary") },
            label = { Text("Vocab") },
        )
        NavigationBarItem(
            selected = current is Screen.Grammar,
            onClick = { select(Screen.Grammar) },
            icon = { Icon(Icons.Outlined.AutoFixHigh, contentDescription = "Grammar") },
            label = { Text("Grammar") },
        )
        NavigationBarItem(
            selected = current is Screen.Clipboard,
            onClick = { select(Screen.Clipboard) },
            icon = { Icon(Icons.Outlined.ContentPaste, contentDescription = "Clipboard") },
            label = { Text("Clipboard") },
        )
        NavigationBarItem(
            selected = current is Screen.Settings && (current as Screen.Settings).showBack.not(),
            onClick = { select(Screen.Settings(showBack = false)) },
            icon = { Icon(Icons.Outlined.Settings, contentDescription = "Settings") },
            label = { Text("Settings") },
        )
    }
}

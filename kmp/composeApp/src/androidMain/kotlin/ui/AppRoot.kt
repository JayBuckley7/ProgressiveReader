package com.progressivereader.kmp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
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
    requestSessionJwt: suspend () -> String?,
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
    onUpdateDebugMode: suspend (Boolean) -> Unit,
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
                bottomBar = { ShellBottomBar(current = Screen.Library, onSelect = { navigator.reset(it) }) },
            )

        Screen.Vocabulary ->
            VocabularyScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                onOpenLogin = { navigator.push(Screen.Login(autoStartSignIn = true)) },
                bottomBar = { ShellBottomBar(current = Screen.Vocabulary, onSelect = { navigator.reset(it) }) },
            )

        Screen.Clipboard ->
            ClipboardScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                onOpenLogin = { navigator.push(Screen.Login(autoStartSignIn = true)) },
                bottomBar = { ShellBottomBar(current = Screen.Clipboard, onSelect = { navigator.reset(it) }) },
            )

        Screen.Grammar ->
            GrammarScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                bookCache = bookCache,
                epubRepository = epubRepository,
                showBack = false,
                onBack = { navigator.pop() },
                bottomBar = { ShellBottomBar(current = Screen.Grammar, onSelect = { navigator.reset(it) }) },
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
                requestSessionJwt = requestSessionJwt,
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
                onUpdateDebugMode = { enabled -> scope.launch { onUpdateDebugMode(enabled) } },
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
                        { ShellBottomBar(current = Screen.Settings(showBack = false), onSelect = { navigator.reset(it) }) }
                    },
            )
    }
}

@Composable
internal fun ShellBottomBar(
    current: Screen,
    onSelect: (Screen) -> Unit,
) {
    val chrome = shellChromeFor(current)

    fun select(screen: Screen) {
        if (screen == current) return
        onSelect(screen)
    }

    NavigationBar(
        modifier = Modifier.testTag(UiTestTags.shellBottomBar),
        containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
        tonalElevation = 0.dp,
    ) {
        shellDestinations.forEach { destination ->
            NavigationBarItem(
                modifier = Modifier.testTag(UiTestTags.shellDestination(destination.label)),
                selected = chrome.selectedDestination == destination,
                onClick = { select(destination.target) },
                colors = AppShellBarColors(),
                icon = { Icon(destination.icon, contentDescription = destination.label) },
                label = { Text(destination.shortLabel) },
            )
        }
    }
}

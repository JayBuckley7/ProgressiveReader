package com.progressivereader.kmp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import com.clerk.api.Clerk
import com.progressivereader.kmp.navigation.Navigator
import com.progressivereader.kmp.navigation.Screen
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.settings.AppSettings
import kotlinx.coroutines.launch

@Composable
fun AppRoot(
    navigator: Navigator,
    settings: AppSettings,
    sessionJwt: String?,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    onSetSessionJwt: suspend (String?) -> Unit,
    onUpdateBackendBaseUrl: suspend (String) -> Unit,
    onUpdateDriveFolderId: suspend (String?) -> Unit,
    onUpdateReaderDarkMode: suspend (Boolean) -> Unit,
    onUpdateReaderFontSizeSp: suspend (Float) -> Unit,
) {
    val scope = rememberCoroutineScope()

    when (val s = navigator.current) {
        Screen.Library ->
            LibraryScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                bookCache = bookCache,
                epubRepository = epubRepository,
                onOpenReader = { bookId -> navigator.push(Screen.Reader(bookId)) },
                onOpenSettings = { navigator.push(Screen.Settings) },
                onOpenLogin = { navigator.push(Screen.Login(autoStartSignIn = true)) },
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
            ReaderScreen(
                bookId = s.bookId,
                settings = settings,
                bookCache = bookCache,
                epubRepository = epubRepository,
                onBack = { navigator.pop() },
                onSetDarkMode = { enabled -> scope.launch { onUpdateReaderDarkMode(enabled) } },
                onSetFontSizeSp = { sp -> scope.launch { onUpdateReaderFontSizeSp(sp) } },
            )

        Screen.Settings ->
            SettingsScreen(
                settings = settings,
                sessionJwt = sessionJwt,
                onBack = { navigator.pop() },
                onUpdateBackendBaseUrl = { url -> scope.launch { onUpdateBackendBaseUrl(url) } },
                onUpdateDriveFolderId = { folderId -> scope.launch { onUpdateDriveFolderId(folderId) } },
                onUpdateReaderDarkMode = { enabled -> scope.launch { onUpdateReaderDarkMode(enabled) } },
                onUpdateReaderFontSizeSp = { sp -> scope.launch { onUpdateReaderFontSizeSp(sp) } },
                onOpenLogin = { navigator.push(Screen.Login(autoStartSignIn = true)) },
                onSignOut = {
                    scope.launch {
                        runCatching { Clerk.signOut() }
                        onSetSessionJwt(null)
                        navigator.reset(Screen.Library)
                    }
                },
            )
    }
}

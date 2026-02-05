package com.progressivereader.kmp

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.navigation.Screen
import com.progressivereader.kmp.navigation.rememberNavigator
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.session.SessionStore
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.settings.AppSettingsStore
import com.progressivereader.kmp.ui.AppRoot
import com.progressivereader.kmp.ui.ProgressiveReaderTheme

@Composable
actual fun App() {
    val appContext = LocalContext.current.applicationContext

    val settingsStore = remember { AppSettingsStore(appContext) }
    val sessionStore = remember { SessionStore(appContext) }
    val bookCache = remember { BookCache(appContext) }
    val epubRepository = remember { EpubRepository() }

    val settings by settingsStore.settingsFlow.collectAsState(initial = AppSettings())
    val sessionJwt by sessionStore.jwtFlow.collectAsState(initial = null)

    LaunchedEffect(settings.backendBaseUrl) { Config.baseUrl = settings.backendBaseUrl }

    ProgressiveReaderTheme {
        val navigator = rememberNavigator(start = Screen.Library)
        AppRoot(
            navigator = navigator,
            settings = settings,
            sessionJwt = sessionJwt,
            bookCache = bookCache,
            epubRepository = epubRepository,
            onSetSessionJwt = { jwt -> sessionStore.setJwt(jwt) },
            onUpdateBackendBaseUrl = { url -> settingsStore.setBackendBaseUrl(url) },
            onUpdateDriveFolderId = { folderId -> settingsStore.setDriveFolderId(folderId) },
            onUpdateReaderDarkMode = { enabled -> settingsStore.setReaderDarkMode(enabled) },
            onUpdateReaderFontSizeSp = { sp -> settingsStore.setReaderFontSizeSp(sp) },
        )
    }
}


package com.progressivereader.kmp

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.ClerkResult
import com.clerk.api.session.fetchToken
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
    val storedJwt by sessionStore.jwtFlow.collectAsState(initial = null)
    val autoSignInEnabled by sessionStore.autoSignInEnabledFlow.collectAsState(initial = true)

    var hasJwtOverride by remember { mutableStateOf(false) }
    var jwtOverride by remember { mutableStateOf<String?>(null) }
    val sessionJwt = if (hasJwtOverride) jwtOverride else storedJwt

    LaunchedEffect(hasJwtOverride, jwtOverride, storedJwt) {
        if (hasJwtOverride && jwtOverride == storedJwt) {
            hasJwtOverride = false
            jwtOverride = null
        }
    }

    LaunchedEffect(settings.backendBaseUrl) { Config.baseUrl = settings.backendBaseUrl }

    suspend fun setSessionJwt(jwt: String?) {
        hasJwtOverride = true
        jwtOverride = jwt

        if (jwt.isNullOrBlank()) sessionStore.setAutoSignInEnabled(false) else sessionStore.setAutoSignInEnabled(true)
        sessionStore.setJwt(jwt)
    }

    LaunchedEffect(sessionJwt, autoSignInEnabled) {
        if (!sessionJwt.isNullOrBlank()) return@LaunchedEffect
        if (!autoSignInEnabled) return@LaunchedEffect

        val publishableKey = BuildConfig.CLERK_PUBLISHABLE_KEY
        if (publishableKey.isBlank()) return@LaunchedEffect

        runCatching {
            if (Clerk.isInitialized.value != true) {
                Clerk.initialize(
                    context = appContext,
                    publishableKey = publishableKey,
                )
            }
        }

        val tokenRes = runCatching { Clerk.session?.fetchToken() }.getOrNull()
        if (tokenRes is ClerkResult.Success) {
            runCatching { setSessionJwt(tokenRes.value.jwt) }
        }
    }

    ProgressiveReaderTheme(theme = settings.reader.theme) {
        val navigator = rememberNavigator(start = Screen.Library)
        AppRoot(
            navigator = navigator,
            settings = settings,
            sessionJwt = sessionJwt,
            bookCache = bookCache,
            epubRepository = epubRepository,
            onSetSessionJwt = { jwt -> setSessionJwt(jwt) },
            onUpdateReaderTheme = { theme -> settingsStore.setReaderTheme(theme) },
            onUpdateReaderFontSizeSp = { sp -> settingsStore.setReaderFontSizeSp(sp) },
            onUpdateReaderTtsRate = { rate -> settingsStore.setReaderTtsRate(rate) },
            onUpdateReaderOpenAiApiKey = { key -> settingsStore.setReaderOpenAiApiKey(key) },
            onUpdateReaderOpenAiModel = { model -> settingsStore.setReaderOpenAiModel(model) },
            onUpdateReaderCacheTranslations = { enabled -> settingsStore.setReaderCacheTranslations(enabled) },
            onUpdateReaderUiLanguage = { lang -> settingsStore.setReaderUiLanguage(lang) },
            onUpdateReaderJpdbApiKey = { key -> settingsStore.setReaderJpdbApiKey(key) },
            onUpdateReaderCefrLevel = { level -> settingsStore.setReaderCefrLevel(level) },
            onUpdateReaderJpdbHighlightEnabled = { enabled -> settingsStore.setReaderJpdbHighlightEnabled(enabled) },
            onUpdateReaderTranslationTargetLang = { lang -> settingsStore.setReaderTranslationTargetLang(lang) },
            onResetDriveOverrides = {
                settingsStore.setDriveFolderId(null)
                settingsStore.setBackendBaseUrl("http://10.0.2.2:5000")
            },
        )
    }
}

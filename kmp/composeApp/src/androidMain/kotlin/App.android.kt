@file:Suppress("RememberReturnType") // Compose lint cannot resolve commonMain constructor return types in this KMP module.

package com.progressivereader.kmp

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.progressivereader.kmp.auth.ClerkAndroid
import com.progressivereader.kmp.adapters.AndroidCoverCachePort
import com.progressivereader.kmp.adapters.AndroidCryptoPort
import com.progressivereader.kmp.adapters.AndroidDocumentPort
import com.progressivereader.kmp.adapters.AndroidDrivePort
import com.progressivereader.kmp.adapters.AndroidGrammarPort
import com.progressivereader.kmp.adapters.AndroidGrammarUnderlinePort
import com.progressivereader.kmp.adapters.AndroidJpdbActionsPort
import com.progressivereader.kmp.adapters.AndroidJpdbHighlightPort
import com.progressivereader.kmp.adapters.AndroidJpdbMirrorPort
import com.progressivereader.kmp.adapters.AndroidLibraryPort
import com.progressivereader.kmp.adapters.AndroidMixApplyPort
import com.progressivereader.kmp.adapters.AndroidMixRefinePort
import com.progressivereader.kmp.adapters.AndroidReaderPort
import com.progressivereader.kmp.adapters.AndroidTimePort
import com.progressivereader.kmp.adapters.AndroidTranslationCachePort
import com.progressivereader.kmp.adapters.AndroidTranslationPort
import com.progressivereader.kmp.adapters.AndroidAiPort
import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import com.progressivereader.kmp.drive.DriveJsonFileService
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.navigation.Screen
import com.progressivereader.kmp.navigation.rememberNavigator
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.session.SessionStore
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.settings.AppSettingsStore
import com.progressivereader.kmp.logging.AppLog
import com.progressivereader.kmp.ui.AppRoot
import com.progressivereader.kmp.ui.ProgressiveReaderTheme
import com.progressivereader.kmp.ui.viewmodels.LibraryViewModelFactory
import com.progressivereader.kmp.ui.viewmodels.ReaderViewModelFactory
import com.progressivereader.kmp.usecases.library.CreateVirtualFolderUseCase
import com.progressivereader.kmp.usecases.library.DeleteVirtualFolderUseCase
import com.progressivereader.kmp.usecases.library.DownloadBookUseCase
import com.progressivereader.kmp.usecases.library.EnsureRemoteCoverUseCase
import com.progressivereader.kmp.usecases.library.FetchDriveLibraryUseCase
import com.progressivereader.kmp.usecases.library.ImportBookUseCase
import com.progressivereader.kmp.usecases.library.LoadMetadataUseCase
import com.progressivereader.kmp.usecases.library.MoveBookToVirtualFolderUseCase
import com.progressivereader.kmp.usecases.library.RefreshCachedLibraryUseCase
import com.progressivereader.kmp.usecases.library.RenameVirtualFolderUseCase
import com.progressivereader.kmp.usecases.library.RemoveCustomCoverUseCase
import com.progressivereader.kmp.usecases.library.SetCustomCoverUseCase
import com.progressivereader.kmp.usecases.library.SyncCachedFoldersFromMetadataUseCase
import com.progressivereader.kmp.usecases.library.UpsertMetadataJsonUseCase
import com.progressivereader.kmp.usecases.reader.ApplyMixUseCase
import com.progressivereader.kmp.usecases.reader.ClearLatestMixChoicesUseCase
import com.progressivereader.kmp.usecases.reader.HighlightChapterUseCase
import com.progressivereader.kmp.usecases.reader.LoadBookStateUseCase
import com.progressivereader.kmp.usecases.reader.LoadCachedTranslationUseCase
import com.progressivereader.kmp.usecases.reader.LoadChapterContentUseCase
import com.progressivereader.kmp.usecases.reader.LoadJpdbMirrorSnapshotUseCase
import com.progressivereader.kmp.usecases.reader.LoadLatestMixChoicesUseCase
import com.progressivereader.kmp.usecases.reader.MarkBookOpenedUseCase
import com.progressivereader.kmp.usecases.reader.MineWordUseCase
import com.progressivereader.kmp.usecases.reader.NowIsoUtcUseCase
import com.progressivereader.kmp.usecases.reader.OpenBookUseCase
import com.progressivereader.kmp.usecases.reader.ObserveGrammarStateUseCase
import com.progressivereader.kmp.usecases.reader.RefineMixUseCase
import com.progressivereader.kmp.usecases.reader.ReviewCardUseCase
import com.progressivereader.kmp.usecases.reader.SaveBookStateUseCase
import com.progressivereader.kmp.usecases.reader.TranslateChapterUseCase
import com.progressivereader.kmp.usecases.reader.UnderlineGrammarUseCase
import com.progressivereader.kmp.usecases.reader.UpdateCachedTokenStateUseCase
import com.progressivereader.kmp.usecases.reader.UpdateWordStateUseCase
import kotlinx.coroutines.delay

@Composable
actual fun App() {
    val appContext = LocalContext.current.applicationContext
    LaunchedEffect(Unit) {
        AppLog.install(appContext)
        AppLog.i("App", "Compose app started.")
    }

    val settingsStore = remember { AppSettingsStore(appContext) }
    val sessionStore = remember { SessionStore(appContext) }
    val bookCache = remember { BookCache(appContext) }
    val epubRepository = remember { EpubRepository() }

    val settings by settingsStore.settingsFlow.collectAsState(initial = AppSettings())
    val storedJwt by sessionStore.jwtFlow.collectAsState(initial = null)
    val autoSignInEnabled by sessionStore.autoSignInEnabledFlow.collectAsState(initial = true)

    var hasJwtOverride by remember { mutableStateOf(false) }
    var jwtOverride by remember { mutableStateOf<String?>(null) }
    val sessionJwt =
        (if (hasJwtOverride) jwtOverride else storedJwt)
            ?.takeIf { ClerkAndroid.isSessionTokenUsable(it) }
    val sessionJwtState = rememberUpdatedState(sessionJwt)
    val storedJwtState = rememberUpdatedState(storedJwt)
    val autoSignInEnabledState = rememberUpdatedState(autoSignInEnabled)

    LaunchedEffect(hasJwtOverride, jwtOverride, storedJwt) {
        if (hasJwtOverride && jwtOverride == storedJwt) {
            hasJwtOverride = false
            jwtOverride = null
        }
    }

    LaunchedEffect(settings.backendBaseUrl) {
        Config.baseUrl = settings.backendBaseUrl
        AppLog.i("App", "Using backend base URL: ${Config.baseUrl}")
    }

    suspend fun setSessionJwt(jwt: String?) {
        hasJwtOverride = true
        jwtOverride = jwt
        AppLog.i("Auth", if (jwt.isNullOrBlank()) "Clearing session JWT." else "Persisting session JWT.")

        if (jwt.isNullOrBlank()) sessionStore.setAutoSignInEnabled(false) else sessionStore.setAutoSignInEnabled(true)
        sessionStore.setJwt(jwt)
    }

    suspend fun refreshSessionJwtFromClerk(reason: String): String? {
        if (!ClerkAndroid.isConfigured) return null

        ClerkAndroid.initialize(appContext).onFailure {
            AppLog.e("Auth", "Failed to initialize Clerk while refreshing session token for $reason.", it)
            return null
        }

        val freshJwt = ClerkAndroid.fetchSessionToken(appContext)
        if (freshJwt.isNullOrBlank()) {
            AppLog.w("Auth", "No usable Clerk session token available for $reason.")
            return null
        }

        val currentStored = storedJwtState.value
        if (freshJwt != currentStored) {
            AppLog.i("Auth", "Refreshed Clerk session token from active session for $reason.")
            runCatching { setSessionJwt(freshJwt) }
        }
        return freshJwt
    }

    suspend fun currentBackendSessionJwt(reason: String, forceRefresh: Boolean = false): String? {
        val current =
            sessionJwtState.value
                ?.takeIf { !forceRefresh }
                ?.takeIf { ClerkAndroid.isSessionTokenUsable(it) }
        if (!current.isNullOrBlank()) return current
        if (!autoSignInEnabledState.value) return null
        return refreshSessionJwtFromClerk(reason)
    }

    LaunchedEffect(sessionJwt, autoSignInEnabled) {
        if (!autoSignInEnabled) return@LaunchedEffect

        if (!ClerkAndroid.isConfigured) return@LaunchedEffect

        while (true) {
            val currentJwt = sessionJwtState.value
            if (currentJwt.isNullOrBlank()) {
                // Give DataStore a chance to restore the saved token before asking Clerk to refresh it.
                delay(1_000)
            } else {
                // Refresh near expiry instead of waking Clerk and the network every 30 seconds.
                val secondsUntilRefresh =
                    ((ClerkAndroid.secondsUntilExpiry(currentJwt) ?: 300L) - 300L)
                        .coerceIn(30L, 21_600L)
                delay(secondsUntilRefresh * 1_000L)
            }
            refreshSessionJwtFromClerk(reason = "background refresh")
            delay(30_000)
        }
    }

    ProgressiveReaderTheme(theme = settings.reader.theme) {
        val debugLaunch = DebugLaunchBridge.pendingRequest
        val navigator = rememberNavigator(start = debugLaunch?.startScreen ?: Screen.Library)

        LaunchedEffect(debugLaunch?.id) {
            val request = debugLaunch ?: return@LaunchedEffect
            navigator.reset(request.startScreen)
            DebugLaunchBridge.consume(request.id)
        }

        // Library composition root: ports -> use-cases -> viewmodel factory.
        val driveFolderIdState = rememberUpdatedState(settings.driveFolderId)

        val timePort = remember { AndroidTimePort() }
        val documentPort = remember { AndroidDocumentPort(appContext) }
        val coverCachePort = remember { AndroidCoverCachePort(appContext) }
        val http = remember { createHttpClient() }

        val driveService =
            remember {
                DriveService {
                    currentBackendSessionJwt(reason = "Drive request")
                }
            }
        val driveJsonFileService =
            remember {
                DriveJsonFileService(
                    driveService = driveService,
                    getDriveFolderOverride = { driveFolderIdState.value },
                )
            }
        LaunchedEffect(sessionJwt, settings.driveFolderId) {
            if (sessionJwt.isNullOrBlank()) return@LaunchedEffect

            val tokenInfo = runCatching { driveService.requestGoogleAccessToken() }.getOrNull()
            if (tokenInfo == null) {
                AppLog.w("Drive", "Failed to acquire Google Drive access token from Clerk bridge.")
            } else {
                AppLog.i("Drive", "Acquired Google Drive access token from Clerk bridge (expiresIn=${tokenInfo.expires_in}s).")
            }

            val appFolder = runCatching { driveService.ensureAppFolder() }.getOrNull()
            if (appFolder == null) {
                AppLog.w("Drive", "Failed to resolve Progressive Reader Drive folder.")
            } else {
                AppLog.i("Drive", "Resolved Drive folder '${appFolder.name}' (${appFolder.id}).")
            }
        }
        val drivePort =
            remember {
                AndroidDrivePort(
                    http = http,
                    getSessionJwt = { sessionJwtState.value },
                    driveService = driveService,
                    driveJsonFileService = driveJsonFileService,
                )
            }
        val libraryPort = remember { AndroidLibraryPort(bookCache = bookCache, epubRepository = epubRepository, timePort = timePort) }

        val refreshCachedLibrary = remember { RefreshCachedLibraryUseCase(libraryPort) }
        val fetchDriveLibrary = remember { FetchDriveLibraryUseCase(drivePort) }
        val loadMetadata = remember { LoadMetadataUseCase(drivePort) }
        val syncCachedFoldersFromMetadata = remember { SyncCachedFoldersFromMetadataUseCase(libraryPort, timePort) }
        val downloadBook = remember { DownloadBookUseCase(drivePort, libraryPort, timePort) }
        val importBook = remember { ImportBookUseCase(documentPort, drivePort, libraryPort, timePort) }
        val ensureRemoteCover = remember { EnsureRemoteCoverUseCase(drivePort, coverCachePort) }

        val upsertMetadataJson = remember { UpsertMetadataJsonUseCase(drivePort) }
        val moveBookToVirtualFolder = remember { MoveBookToVirtualFolderUseCase(upsertMetadataJson) }
        val createVirtualFolder = remember { CreateVirtualFolderUseCase(upsertMetadataJson, timePort) }
        val renameVirtualFolder = remember { RenameVirtualFolderUseCase(upsertMetadataJson, timePort) }
        val deleteVirtualFolder = remember { DeleteVirtualFolderUseCase(upsertMetadataJson) }
        val removeCustomCover = remember { RemoveCustomCoverUseCase(drivePort, coverCachePort, upsertMetadataJson) }
        val setCustomCover = remember { SetCustomCoverUseCase(drivePort, documentPort, coverCachePort, upsertMetadataJson) }

        val libraryViewModelFactory =
            remember {
                LibraryViewModelFactory(
                    refreshCachedLibrary = refreshCachedLibrary,
                    fetchDriveLibrary = fetchDriveLibrary,
                    loadMetadata = loadMetadata,
                    syncCachedFoldersFromMetadata = syncCachedFoldersFromMetadata,
                    downloadBook = downloadBook,
                    importBook = importBook,
                    ensureRemoteCover = ensureRemoteCover,
                    moveBookToVirtualFolder = moveBookToVirtualFolder,
                    createVirtualFolder = createVirtualFolder,
                    renameVirtualFolder = renameVirtualFolder,
                    deleteVirtualFolder = deleteVirtualFolder,
                    removeCustomCover = removeCustomCover,
                    setCustomCover = setCustomCover,
                )
            }

        // Reader composition root: ports -> use-cases -> viewmodel factory.
        val cryptoPort = remember { AndroidCryptoPort() }
        val readerPort = remember { AndroidReaderPort(bookCache = bookCache, epubRepository = epubRepository, cryptoPort = cryptoPort) }
        val translationCachePort = remember { AndroidTranslationCachePort(bookCache = bookCache) }
        val translationPort = remember { AndroidTranslationPort(getSessionJwt = { sessionJwtState.value }) }
        val mixRefinePort = remember { AndroidMixRefinePort(bookCache = bookCache) }
        val mixApplyPort = remember { AndroidMixApplyPort() }
        val aiPort = remember { AndroidAiPort() }

        val jpdbMirrorPort = remember { AndroidJpdbMirrorPort(appContext) }
        val jpdbHighlightPort = remember { AndroidJpdbHighlightPort(bookCache = bookCache, timePort = timePort) }
        val jpdbActionsPort = remember { AndroidJpdbActionsPort(getSessionJwt = { sessionJwtState.value }) }
        val grammarPort = remember { AndroidGrammarPort(appContext) }
        val grammarUnderlinePort = remember { AndroidGrammarUnderlinePort() }

        val openBook = remember { OpenBookUseCase(readerPort) }
        val markBookOpened = remember { MarkBookOpenedUseCase(readerPort) }
        val loadBookState = remember { LoadBookStateUseCase(readerPort) }
        val saveBookState = remember { SaveBookStateUseCase(readerPort) }
        val nowIsoUtc = remember { NowIsoUtcUseCase(timePort) }
        val loadChapterContent = remember { LoadChapterContentUseCase(readerPort) }
        val loadCachedTranslation = remember { LoadCachedTranslationUseCase(translationCachePort, cryptoPort) }
        val translateChapter = remember { TranslateChapterUseCase(translationPort, translationCachePort, timePort, cryptoPort) }
        val loadMirrorSnapshot = remember { LoadJpdbMirrorSnapshotUseCase(jpdbMirrorPort) }
        val highlightChapter = remember { HighlightChapterUseCase(jpdbHighlightPort) }
        val updateCachedTokenState = remember { UpdateCachedTokenStateUseCase(jpdbHighlightPort) }
        val observeGrammarState = remember { ObserveGrammarStateUseCase(grammarPort) }
        val underlineGrammar = remember { UnderlineGrammarUseCase(grammarUnderlinePort) }
        val loadLatestMixChoices = remember { LoadLatestMixChoicesUseCase(mixRefinePort) }
        val applyMix = remember { ApplyMixUseCase(mixApplyPort, cryptoPort) }
        val refineMix = remember { RefineMixUseCase(mixRefinePort, aiPort) }
        val clearLatestMixChoices = remember { ClearLatestMixChoicesUseCase(mixRefinePort) }
        val mineWord = remember { MineWordUseCase(jpdbActionsPort) }
        val updateWordState = remember { UpdateWordStateUseCase(jpdbActionsPort) }
        val reviewCard = remember { ReviewCardUseCase(jpdbActionsPort) }

        val readerViewModelFactory =
            remember {
                ReaderViewModelFactory(
                    openBookUseCase = openBook,
                    markBookOpenedUseCase = markBookOpened,
                    loadBookStateUseCase = loadBookState,
                    saveBookStateUseCase = saveBookState,
                    nowIsoUtcUseCase = nowIsoUtc,
                    loadChapterContentUseCase = loadChapterContent,
                    loadCachedTranslationUseCase = loadCachedTranslation,
                    translateChapterUseCase = translateChapter,
                    loadJpdbMirrorSnapshotUseCase = loadMirrorSnapshot,
                    highlightChapterUseCase = highlightChapter,
                    updateCachedTokenStateUseCase = updateCachedTokenState,
                    observeGrammarStateUseCase = observeGrammarState,
                    underlineGrammarUseCase = underlineGrammar,
                    loadLatestMixChoicesUseCase = loadLatestMixChoices,
                    applyMixUseCase = applyMix,
                    refineMixUseCase = refineMix,
                    clearLatestMixChoicesUseCase = clearLatestMixChoices,
                    mineWordUseCase = mineWord,
                    updateWordStateUseCase = updateWordState,
                    reviewCardUseCase = reviewCard,
                )
            }

        AppRoot(
            navigator = navigator,
            settings = settings,
            sessionJwt = sessionJwt,
            requestSessionJwt = { currentBackendSessionJwt(reason = "Settings request") },
            libraryViewModelFactory = libraryViewModelFactory,
            readerViewModelFactory = readerViewModelFactory,
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
            onUpdateReaderMixEnabled = { enabled -> settingsStore.setReaderMixEnabled(enabled) },
            onUpdateReaderMixAggression = { value -> settingsStore.setReaderMixAggression(value) },
            onUpdateReaderMixAutoEnableHighlight = { enabled -> settingsStore.setReaderMixAutoEnableHighlight(enabled) },
            onUpdateReaderMixBackupMirrorToDrive = { enabled -> settingsStore.setReaderMixBackupMirrorToDrive(enabled) },
            onUpdateDebugMode = { enabled -> settingsStore.setDebugMode(enabled) },
            onResetDriveOverrides = {
                settingsStore.setDriveFolderId(null)
                settingsStore.setBackendBaseUrl("https://progressivereader.net")
            },
        )
    }
}

package com.progressivereader.kmp.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Update
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.BooksIndex
import com.progressivereader.kmp.offline.CachedBookEntry
import com.progressivereader.kmp.offline.DriveCoverCache
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.settings.AppSettings
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.url
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.isSuccess
import io.ktor.utils.io.readAvailable
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun LibraryScreen(
    settings: AppSettings,
    sessionJwt: String?,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    onOpenReader: (bookId: String) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenLogin: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val isOnline = rememberIsOnline()
    val canUseDrive = isOnline && !sessionJwt.isNullOrBlank()

    val context = LocalContext.current.applicationContext
    val driveCoverCache = remember { DriveCoverCache(context) }
    val remoteCoverPathById = remember { mutableStateMapOf<String, String?>() }
    val remoteCoverLoadingById = remember { mutableStateMapOf<String, Boolean>() }
    val coverFetchSemaphore = remember { Semaphore(permits = 4) }
    var coverImageIdByBookId by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var lastMetadataFileIdLoaded by remember { mutableStateOf<String?>(null) }
    var metadataLoadError by remember { mutableStateOf<String?>(null) }

    val metadataJson =
        remember {
            Json {
                ignoreUnknownKeys = true
                isLenient = true
            }
        }

    val http = remember { createHttpClient() }
    val driveService = remember(sessionJwt) { DriveService { sessionJwt } }

    var cachedIndex by remember { mutableStateOf<BooksIndex?>(null) }
    var remoteFiles by remember { mutableStateOf<List<DriveService.DriveFile>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var downloadingId by remember { mutableStateOf<String?>(null) }
    var driveFetchFailed by remember { mutableStateOf(false) }
    var collapsedShelves by remember { mutableStateOf(setOf<String>()) }
    var initialFolderCollapseApplied by remember { mutableStateOf(false) }
    var inferredRootFolder by remember { mutableStateOf<DriveService.DriveFile?>(null) }
    var lastDriveRootFolderIdFetched by remember { mutableStateOf<String?>(null) }

    var virtualFolderNameById by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var virtualFolderIdByBookId by remember { mutableStateOf<Map<String, String?>>(emptyMap()) }

    val showDrive = canUseDrive && !driveFetchFailed
    val showSignedOutLanding =
        sessionJwt.isNullOrBlank() &&
            cachedIndex != null &&
            cachedIndex?.books?.isEmpty() == true

    suspend fun refreshCached() {
        val loaded = bookCache.loadIndex()
        cachedIndex = loaded

        var changed = false
        val updatedBooks =
            loaded.books.map { entry ->
                val existing = coverFileForCached(bookCache, entry)
                if (existing != null && existing.exists()) {
                    if (entry.coverPath.isNullOrBlank() || entry.coverPath != existing.name) {
                        changed = true
                        entry.copy(coverPath = existing.name)
                    } else {
                        entry
                    }
                } else {
                    val extractedDir = bookCache.extractedDir(entry.id)
                    if (!extractedDir.exists()) return@map entry

                    val cover =
                        runCatching {
                            epubRepository.extractCoverIfNeeded(
                                extractedDir = extractedDir,
                                bookDir = bookCache.bookDir(entry.id),
                            )
                        }.getOrNull()
                    if (cover != null && cover.exists()) {
                        changed = true
                        entry.copy(coverPath = cover.name)
                    } else {
                        entry
                    }
                }
            }

        if (changed) {
            val now = isoNowUtc()
            val updated = loaded.copy(updatedAt = now, books = updatedBooks)
            bookCache.saveIndex(updated)
            cachedIndex = updated
        }
    }

    fun parseCoverMapFromMetadataJson(text: String): Map<String, String> {
        val element = runCatching { metadataJson.parseToJsonElement(text) }.getOrNull() ?: return emptyMap()
        val root = element.jsonObject
        val covers = root["covers"]?.jsonObject ?: return emptyMap()
        return covers.mapNotNull { (bookId, value) ->
            val coverId = runCatching { value.jsonPrimitive.content }.getOrNull()
            if (coverId.isNullOrBlank()) null else bookId to coverId
        }.toMap()
    }

    fun parseVirtualFoldersFromMetadataJson(text: String): Map<String, String> {
        val element = runCatching { metadataJson.parseToJsonElement(text) }.getOrNull() ?: return emptyMap()
        val root = element.jsonObject
        val folders = root["folders"]?.jsonObject ?: return emptyMap()
        return folders.mapNotNull { (folderId, value) ->
            val obj = runCatching { value.jsonObject }.getOrNull() ?: return@mapNotNull null
            val name = runCatching { obj["name"]?.jsonPrimitive?.content }.getOrNull()
            if (name.isNullOrBlank()) null else folderId to name
        }.toMap()
    }

    fun parseBookFolderAssignmentsFromMetadataJson(text: String): Map<String, String?> {
        val element = runCatching { metadataJson.parseToJsonElement(text) }.getOrNull() ?: return emptyMap()
        val root = element.jsonObject
        val books = root["books"]?.jsonObject ?: return emptyMap()
        return books.map { (bookId, value) ->
            val obj = runCatching { value.jsonObject }.getOrNull()
            val folderId =
                runCatching { obj?.get("folderId")?.jsonPrimitive?.content }.getOrNull()
                    ?.trim()
                    ?.takeIf { it.isNotBlank() && !it.equals("null", ignoreCase = true) }
            bookId to folderId
        }.toMap()
    }

    suspend fun refreshMetadataIfPresent(files: List<DriveService.DriveFile>, force: Boolean) {
        if (!canUseDrive) return

        val metadataFile =
            files.firstOrNull { it.name.equals("metadata.json", ignoreCase = true) }
                ?: return

        if (!force && metadataFile.id == lastMetadataFileIdLoaded) return

        metadataLoadError = null
        val bytes = runCatching { driveService.download(metadataFile.id) }.getOrNull()
        if (bytes == null || bytes.isEmpty()) {
            metadataLoadError = "Failed to load metadata.json"
            return
        }

        val text = runCatching { bytes.toString(Charsets.UTF_8) }.getOrNull()
        if (text.isNullOrBlank()) {
            metadataLoadError = "Invalid metadata.json"
            return
        }

        val covers = parseCoverMapFromMetadataJson(text)
        val folders = parseVirtualFoldersFromMetadataJson(text)
        val assignments = parseBookFolderAssignmentsFromMetadataJson(text)

        if (covers.isNotEmpty()) coverImageIdByBookId = covers
        virtualFolderNameById = folders
        virtualFolderIdByBookId = assignments
        lastMetadataFileIdLoaded = metadataFile.id
    }

    suspend fun refreshDrive(force: Boolean = false) {
        error = null
        driveFetchFailed = false
        if (force) {
            remoteCoverPathById.clear()
            remoteCoverLoadingById.clear()
        }
        if (!canUseDrive) {
            remoteFiles = null
            return
        }

        val explicitRootFolderId = settings.driveFolderId?.takeIf { it.isNotBlank() }
        if (force && explicitRootFolderId == null) {
            inferredRootFolder = null
            lastDriveRootFolderIdFetched = null
        }

        val effectiveRootFolderId = explicitRootFolderId ?: inferredRootFolder?.id
        if (!force && effectiveRootFolderId == lastDriveRootFolderIdFetched && remoteFiles != null && !driveFetchFailed) {
            return
        }

        remoteFiles = null

        fun onDriveFailure(t: Throwable) {
            error = t.message ?: "Failed to load Drive library"
            driveFetchFailed = true
        }

        fun List<DriveService.DriveFile>.findProgReaderFolder(): DriveService.DriveFile? {
            val folders = filter { it.isFolder() }
            return folders.firstOrNull { it.name.equals("ProgReader", ignoreCase = true) }
                ?: folders.firstOrNull { it.name.equals("ProgressiveReader", ignoreCase = true) }
        }

        if (!effectiveRootFolderId.isNullOrBlank()) {
            val res = runCatching { driveService.listFiles(folderId = effectiveRootFolderId) }
            res.onFailure(::onDriveFailure)
            if (driveFetchFailed) return
            lastDriveRootFolderIdFetched = effectiveRootFolderId
            val list = res.getOrDefault(emptyList()).sortedBy { it.name.lowercase() }
            runCatching { refreshMetadataIfPresent(list, force = force) }
            remoteFiles = list
            return
        }

        val rootRes = runCatching { driveService.listFiles(folderId = null) }
        rootRes.onFailure(::onDriveFailure)
        if (driveFetchFailed) return
        val rootFiles = rootRes.getOrDefault(emptyList())

        val appFolder = rootFiles.findProgReaderFolder()
        if (appFolder != null) {
            inferredRootFolder = appFolder
            val appRes = runCatching { driveService.listFiles(folderId = appFolder.id) }
            appRes.onFailure(::onDriveFailure)
            if (driveFetchFailed) return

            lastDriveRootFolderIdFetched = appFolder.id
            val list = appRes.getOrDefault(emptyList()).sortedBy { it.name.lowercase() }
            runCatching { refreshMetadataIfPresent(list, force = force) }
            remoteFiles = list
            return
        }

        lastDriveRootFolderIdFetched = null
        val list = rootFiles.sortedBy { it.name.lowercase() }
        runCatching { refreshMetadataIfPresent(list, force = force) }
        remoteFiles = list
    }

    fun cachedById(): Map<String, CachedBookEntry> =
        cachedIndex?.books?.associateBy { it.id }.orEmpty()

    suspend fun ensureRemoteCover(file: DriveService.DriveFile, cachedEntry: CachedBookEntry?) {
        if (!canUseDrive) return
        // Covers are supported for EPUB and TXT via metadata.json cover mappings.
        if (!file.isEpub() && !file.isTxt()) return

        val fileId = file.id
        if (remoteCoverPathById.containsKey(fileId)) return
        if (remoteCoverLoadingById[fileId] == true) return

        val localCover = coverFileForCached(bookCache, cachedEntry)
        if (localCover?.exists() == true) return

        val existing = driveCoverCache.existingCoverFile(fileId)
        if (existing != null) {
            remoteCoverPathById[fileId] = existing.absolutePath
            return
        }

        val coverImageId = coverImageIdByBookId[fileId]

        remoteCoverLoadingById[fileId] = true
        try {
            coverFetchSemaphore.withPermit {
                val dest = driveCoverCache.coverFile(fileId)
                if (!coverImageId.isNullOrBlank()) {
                    val thumbRes =
                        downloadDriveThumbnailTo(
                            http = http,
                            jwt = sessionJwt!!,
                            fileId = coverImageId,
                            dest = dest,
                            size = 600,
                        )
                    if (thumbRes == ThumbnailDownloadResult.Success) {
                        remoteCoverPathById[fileId] = dest.absolutePath
                        return@withPermit
                    }

                    val ok = downloadDriveFileTo(http = http, jwt = sessionJwt!!, fileId = coverImageId, dest = dest)
                    remoteCoverPathById[fileId] = if (ok && dest.exists() && dest.length() > 0) dest.absolutePath else null
                    return@withPermit
                }

                if (file.hasThumbnail == false && file.thumbnailLink.isNullOrBlank()) {
                    remoteCoverPathById[fileId] = null
                    return@withPermit
                }

                when (downloadDriveThumbnailTo(http = http, jwt = sessionJwt!!, fileId = fileId, dest = dest)) {
                    ThumbnailDownloadResult.Success -> remoteCoverPathById[fileId] = dest.absolutePath
                    ThumbnailDownloadResult.NotFound -> remoteCoverPathById[fileId] = null
                    ThumbnailDownloadResult.Failed -> remoteCoverPathById[fileId] = null
                }
            }
        } finally {
            remoteCoverLoadingById[fileId] = false
        }
    }

    LaunchedEffect(Unit) { refreshCached() }
    LaunchedEffect(canUseDrive, settings.driveFolderId, settings.backendBaseUrl) { refreshDrive(force = false) }
    LaunchedEffect(sessionJwt, settings.driveFolderId) {
        initialFolderCollapseApplied = false
        collapsedShelves = setOf()
    }
    LaunchedEffect(sessionJwt) {
        if (sessionJwt.isNullOrBlank()) {
            coverImageIdByBookId = emptyMap()
            lastMetadataFileIdLoaded = null
            metadataLoadError = null
            remoteCoverPathById.clear()
            remoteCoverLoadingById.clear()
        }
    }
    LaunchedEffect(settings.driveFolderId) {
        if (!settings.driveFolderId.isNullOrBlank()) {
            inferredRootFolder = null
            lastDriveRootFolderIdFetched = null
        }
    }
    LaunchedEffect(remoteFiles) {
        val files = remoteFiles ?: return@LaunchedEffect
        if (initialFolderCollapseApplied) return@LaunchedEffect
        collapsedShelves = files.filter { it.isFolder() }.map { it.id }.toSet()
        initialFolderCollapseApplied = true
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                title = { Text(if (showSignedOutLanding) "Progressive Reader" else "Library") },
                actions = {
                    if (showDrive) {
                        IconButton(onClick = { scope.launch { refreshDrive(force = true) } }) {
                            Icon(Icons.Outlined.Refresh, contentDescription = "Refresh")
                        }
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Settings")
                    }
                    if (sessionJwt.isNullOrBlank()) {
                        if (showSignedOutLanding) {
                            AppOutlineButton(
                                text = "Sign in",
                                onClick = onOpenLogin,
                            )
                        } else {
                            IconButton(onClick = onOpenLogin) {
                                Icon(Icons.Outlined.Login, contentDescription = "Sign in")
                            }
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = { bottomBar?.invoke() },
    ) { padding ->
        if (showSignedOutLanding) {
            SignedOutLanding(
                modifier = Modifier.fillMaxSize().padding(padding),
                isOnline = isOnline,
                onSignIn = onOpenLogin,
            )
            return@Scaffold
        }

        val files = remoteFiles
        val cachedById = cachedById()

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                !isOnline -> item {
                    InfoBanner(
                        icon = Icons.Outlined.CloudOff,
                        title = "Offline",
                        body = "Showing cached books only.",
                    )
                }
                sessionJwt.isNullOrBlank() -> item {
                    InfoBanner(
                        icon = Icons.Outlined.Login,
                        title = "Guest mode",
                        body = "Sign in to browse Drive and download new books.",
                        actionLabel = "Sign in",
                        onAction = onOpenLogin,
                    )
                }
                driveFetchFailed -> item {
                    InfoBanner(
                        icon = Icons.Outlined.CloudOff,
                        title = "Drive unavailable",
                        body = "Showing cached books only. Check your connection or reload from Settings.",
                    )
                }
            }

            error?.let { msg ->
                item { Text(msg, color = MaterialTheme.colorScheme.error) }
            }

            if (!showDrive) {
                cachedShelves(
                    cachedIndex = cachedIndex,
                    bookCache = bookCache,
                    onOpenReader = onOpenReader,
                )
                return@LazyColumn
            }

            when {
                files == null -> item { CircularProgressIndicator() }
                files.isEmpty() -> item { Text("No files found.") }
                else -> {
                    val allBooks = files.filter { it.isSupportedBook() }
                    val visibleFolders =
                        virtualFolderNameById
                            .filterValues { name -> !name.trim().equals("JLPT", ignoreCase = true) }
                    val knownFolderIds = visibleFolders.keys
                    val uncategorizedBooks =
                        allBooks.filter { file ->
                            val folderId = virtualFolderIdByBookId[file.id]
                            folderId.isNullOrBlank() || !knownFolderIds.contains(folderId)
                        }

                    val folderShelves =
                        visibleFolders
                            .entries
                            .sortedBy { it.value.lowercase() }
                            .map { (folderId, name) ->
                                folderId to allBooks.filter { f -> virtualFolderIdByBookId[f.id] == folderId }
                            }

                    item {
                        ShelfSection(
                            title = "My Books",
                            subtitle = if (uncategorizedBooks.isEmpty()) "No books." else "${uncategorizedBooks.size} books",
                            collapsed = collapsedShelves.contains("root"),
                            onToggle = {
                                collapsedShelves =
                                    if (collapsedShelves.contains("root")) collapsedShelves - "root" else collapsedShelves + "root"
                            },
                        ) {
                                BookGrid(
                                    books =
                                        uncategorizedBooks.map { file ->
                                            DriveBookCardData(
                                                file = file,
                                                cachedEntry = cachedById[file.id],
                                                coverFile = coverFileForCached(bookCache, cachedById[file.id]),
                                            )
                                        },
                                    downloadingId = downloadingId,
                                    remoteCoverPathFor = { id -> remoteCoverPathById[id] },
                                    remoteCoverAttemptedFor = { id -> remoteCoverPathById.containsKey(id) },
                                    ensureRemoteCover = { file, cachedEntry -> ensureRemoteCover(file, cachedEntry) },
                                    onOpen = { onOpenReader(it) },
                                    onDownload = { file, needsUpdate ->
                                        scope.launch {
                                            error = null
                                        downloadingId = file.id
                                        try {
                                            val destFile = bookCache.contentFile(file.id, file.mimeType, file.name)
                                            val ok =
                                                downloadDriveFileTo(
                                                    http = http,
                                                    jwt = sessionJwt!!,
                                                    fileId = file.id,
                                                    dest = destFile,
                                                )
                                            if (!ok) {
                                                error = "Download failed (${Config.baseUrl})."
                                                return@launch
                                            }

                                            if (needsUpdate) {
                                                bookCache.extractedDir(file.id).deleteRecursively()
                                            }

                                            val coverFile =
                                                if (file.isEpub()) {
                                                    epubRepository.extractIfNeeded(
                                                        epubFile = bookCache.epubFile(file.id),
                                                        extractedDir = bookCache.extractedDir(file.id),
                                                    )
                                                    epubRepository.extractCoverIfNeeded(
                                                        extractedDir = bookCache.extractedDir(file.id),
                                                        bookDir = bookCache.bookDir(file.id),
                                                    )
                                                } else {
                                                    null
                                                }

                                            val now = isoNowUtc()
                                            val existing = bookCache.loadIndex()
                                            val entry =
                                                CachedBookEntry(
                                                    id = file.id,
                                                    name = file.name,
                                                    mimeType = file.mimeType,
                                                    size = file.size,
                                                    modifiedTime = file.modifiedTime,
                                                    parentFolderId = null,
                                                    parentFolderName = null,
                                                    coverPath = coverFile?.name,
                                                    cachedAt = now,
                                                    lastOpenedAt = cachedById[file.id]?.lastOpenedAt,
                                                )
                                            val updated =
                                                existing.copy(
                                                    updatedAt = now,
                                                    books = existing.books.filterNot { it.id == file.id } + entry,
                                                )
                                            bookCache.saveIndex(updated)
                                            cachedIndex = updated
                                            snackbarHostState.showSnackbar(if (needsUpdate) "Updated download" else "Downloaded")

                                            onOpenReader(file.id)
                                        } catch (t: Throwable) {
                                            error = t.message ?: "Download failed"
                                        } finally {
                                            downloadingId = null
                                        }
                                    }
                                },
                            )
                        }
                    }

                    items(folderShelves, key = { it.first }) { (folderId, folderFiles) ->
                        val collapsed = collapsedShelves.contains(folderId)
                        ShelfSection(
                            title = virtualFolderNameById[folderId] ?: folderId,
                            subtitle =
                                when {
                                    folderFiles.isEmpty() -> "No books"
                                    else -> "${folderFiles.size} books"
                                },
                            leadingIcon = { Icon(Icons.Outlined.Folder, contentDescription = null) },
                            collapsed = collapsed,
                            onToggle = {
                                collapsedShelves =
                                    if (collapsed) collapsedShelves - folderId else collapsedShelves + folderId
                            },
                        ) {
                            BookGrid(
                                books =
                                    folderFiles.map { file ->
                                        DriveBookCardData(
                                            file = file,
                                            cachedEntry = cachedById[file.id],
                                            coverFile = coverFileForCached(bookCache, cachedById[file.id]),
                                            parentFolderId = folderId,
                                            parentFolderName = virtualFolderNameById[folderId],
                                        )
                                    },
                                downloadingId = downloadingId,
                                remoteCoverPathFor = { id -> remoteCoverPathById[id] },
                                remoteCoverAttemptedFor = { id -> remoteCoverPathById.containsKey(id) },
                                ensureRemoteCover = { file, cachedEntry -> ensureRemoteCover(file, cachedEntry) },
                                onOpen = { onOpenReader(it) },
                                onDownload = { file, needsUpdate ->
                                    scope.launch {
                                        error = null
                                        downloadingId = file.id
                                        try {
                                            val destFile = bookCache.contentFile(file.id, file.mimeType, file.name)
                                            val ok =
                                                downloadDriveFileTo(
                                                    http = http,
                                                    jwt = sessionJwt!!,
                                                    fileId = file.id,
                                                    dest = destFile,
                                                )
                                            if (!ok) {
                                                error = "Download failed (${Config.baseUrl})."
                                                return@launch
                                            }

                                            if (needsUpdate) {
                                                bookCache.extractedDir(file.id).deleteRecursively()
                                            }

                                            val coverFile =
                                                if (file.isEpub()) {
                                                    epubRepository.extractIfNeeded(
                                                        epubFile = bookCache.epubFile(file.id),
                                                        extractedDir = bookCache.extractedDir(file.id),
                                                    )
                                                    epubRepository.extractCoverIfNeeded(
                                                        extractedDir = bookCache.extractedDir(file.id),
                                                        bookDir = bookCache.bookDir(file.id),
                                                    )
                                                } else {
                                                    null
                                                }

                                            val now = isoNowUtc()
                                            val existing = bookCache.loadIndex()
                                            val entry =
                                                CachedBookEntry(
                                                    id = file.id,
                                                    name = file.name,
                                                    mimeType = file.mimeType,
                                                    size = file.size,
                                                    modifiedTime = file.modifiedTime,
                                                    parentFolderId = folderId,
                                                    parentFolderName = virtualFolderNameById[folderId],
                                                    coverPath = coverFile?.name,
                                                    cachedAt = now,
                                                    lastOpenedAt = cachedById[file.id]?.lastOpenedAt,
                                                )
                                            val updated =
                                                existing.copy(
                                                    updatedAt = now,
                                                    books = existing.books.filterNot { it.id == file.id } + entry,
                                                )
                                            bookCache.saveIndex(updated)
                                            cachedIndex = updated
                                            snackbarHostState.showSnackbar(if (needsUpdate) "Updated download" else "Downloaded")

                                            onOpenReader(file.id)
                                        } catch (t: Throwable) {
                                            error = t.message ?: "Download failed"
                                        } finally {
                                            downloadingId = null
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
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
private fun BookGrid(
    books: List<DriveBookCardData>,
    downloadingId: String?,
    remoteCoverPathFor: (String) -> String?,
    remoteCoverAttemptedFor: (String) -> Boolean,
    ensureRemoteCover: suspend (DriveService.DriveFile, CachedBookEntry?) -> Unit,
    onOpen: (String) -> Unit,
    onDownload: (DriveService.DriveFile, Boolean) -> Unit,
) {
    if (books.isEmpty()) {
        AppMutedText("No books here.")
        return
    }

    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val columns = if (maxWidth < 600.dp) 2 else 3
        val spacing = 12.dp
        val cardWidth = (maxWidth - spacing * (columns - 1)) / columns

        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            maxItemsInEachRow = columns,
            horizontalArrangement = Arrangement.spacedBy(spacing),
            verticalArrangement = Arrangement.spacedBy(spacing),
        ) {
            books.forEach { item ->
                val cachedEntry = item.cachedEntry
                val isCached = cachedEntry != null
                val needsUpdate =
                    isCached && !item.file.modifiedTime.isNullOrBlank() && item.file.modifiedTime != cachedEntry?.modifiedTime
                val localCoverPath = item.coverFile?.absolutePath?.takeIf { item.coverFile.exists() }
                val remoteCoverPath = remoteCoverPathFor(item.file.id)
                val coverPath = localCoverPath ?: remoteCoverPath
                val remoteCoverAttempted = remoteCoverAttemptedFor(item.file.id)

                LibraryBookCard(
                    modifier = Modifier.width(cardWidth),
                    file = item.file,
                    cachedEntry = cachedEntry,
                    coverPath = coverPath,
                    isCached = isCached,
                    needsUpdate = needsUpdate,
                    isBusy = downloadingId == item.file.id,
                    sizeText = item.file.size?.let { formatBytes(it) },
                    remoteCoverAttempted = remoteCoverAttempted,
                    ensureRemoteCover = ensureRemoteCover,
                    onOpen = { onOpen(item.file.id) },
                    onDownload = { onDownload(item.file, needsUpdate) },
                )
            }
        }
    }
}

@Composable
private fun LibraryBookCard(
    modifier: Modifier = Modifier,
    file: DriveService.DriveFile,
    cachedEntry: CachedBookEntry?,
    coverPath: String?,
    isCached: Boolean,
    needsUpdate: Boolean,
    isBusy: Boolean,
    sizeText: String?,
    remoteCoverAttempted: Boolean,
    ensureRemoteCover: suspend (DriveService.DriveFile, CachedBookEntry?) -> Unit,
    onOpen: () -> Unit,
    onDownload: () -> Unit,
) {
    LaunchedEffect(file.id, remoteCoverAttempted, coverPath) {
        if (coverPath != null) return@LaunchedEffect
        if (remoteCoverAttempted) return@LaunchedEffect
        ensureRemoteCover(file, cachedEntry)
    }

    AppCard(
        modifier =
            modifier
                .fillMaxWidth()
                .clickable(enabled = isCached && !isBusy) { onOpen() },
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val typeLabel =
                when {
                    file.isPdf() -> "PDF"
                    file.isTxt() -> "TXT"
                    else -> "EPUB"
                }
            CoverArt(
                coverPath = coverPath,
                title = file.name,
                modifier = Modifier.fillMaxWidth().aspectRatio(3f / 4f),
                typeLabel = typeLabel,
            )

            Text(
                text = file.name,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                AppChip(text = if (isCached) "Cached" else "Not cached")
                if (needsUpdate) AppChip(text = "Update")
            }

            sizeText?.let { AppMutedText(it) }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                when {
                    isBusy -> CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    isCached -> {
                        AppOutlineButton(text = "Open", onClick = onOpen, modifier = Modifier.weight(1f))
                        if (needsUpdate) {
                            AppTonalButton(
                                text = "Update",
                                onClick = onDownload,
                                icon = { Icon(Icons.Outlined.Update, contentDescription = null, modifier = Modifier.size(18.dp)) },
                            )
                        }
                    }
                    else -> {
                        AppPrimaryButton(
                            text = "Download",
                            onClick = onDownload,
                            modifier = Modifier.weight(1f),
                            icon = { Icon(Icons.Outlined.Download, contentDescription = null, modifier = Modifier.size(18.dp)) },
                        )
                    }
                }
            }
        }
    }
}

private fun LazyListScope.cachedShelves(
    cachedIndex: BooksIndex?,
    bookCache: BookCache,
    onOpenReader: (String) -> Unit,
) {
    when {
        cachedIndex == null -> item { CircularProgressIndicator() }
        cachedIndex.books.isEmpty() -> item { AppMutedText("No cached books yet. Go online and download a book.") }
        else -> {
            val grouped =
                cachedIndex.books.groupBy { it.parentFolderName ?: "My Books" }
            val orderedKeys =
                listOf("My Books") + grouped.keys.filter { it != "My Books" }.sorted()

            orderedKeys.forEach { key ->
                val books = grouped[key].orEmpty().sortedBy { it.name.lowercase() }
                item {
                    ShelfSection(
                        title = key,
                        subtitle = "${books.size} books",
                        collapsed = false,
                        onToggle = {},
                    ) {
                        BookGrid(
                            books =
                                books.map { b ->
                                    DriveBookCardData(
                                        file =
                                            DriveService.DriveFile(
                                                id = b.id,
                                                name = b.name,
                                                mimeType = b.mimeType,
                                                size = b.size,
                                                modifiedTime = b.modifiedTime,
                                            ),
                                        cachedEntry = b,
                                        coverFile = coverFileForCached(bookCache, b),
                                    )
                                },
                            downloadingId = null,
                            remoteCoverPathFor = { _ -> null },
                            remoteCoverAttemptedFor = { _ -> true },
                            ensureRemoteCover = { _, _ -> },
                            onOpen = { onOpenReader(it) },
                            onDownload = { _, _ -> },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ShelfSection(
    title: String,
    subtitle: String? = null,
    collapsed: Boolean,
    onToggle: () -> Unit,
    leadingIcon: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    AppCard(
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().clickable { onToggle() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (leadingIcon != null) leadingIcon()
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium)
                    if (!subtitle.isNullOrBlank()) AppMutedText(subtitle)
                }
                val chevron = if (collapsed) ">" else "v"
                AppMutedText(chevron)
            }
            if (!collapsed) {
                content()
            }
        }
    }
}

@Composable
private fun InfoBanner(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    AppCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(icon, contentDescription = null)
                Text(title, style = MaterialTheme.typography.titleMedium)
            }
            Text(body, style = MaterialTheme.typography.bodyMedium)
            if (!actionLabel.isNullOrBlank() && onAction != null) {
                AppPrimaryButton(text = actionLabel, onClick = onAction)
            }
        }
    }
}

@Composable
private fun SignedOutLanding(
    modifier: Modifier = Modifier,
    isOnline: Boolean,
    onSignIn: () -> Unit,
) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppIconTile(icon = Icons.Outlined.MenuBook, contentDescription = null)
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Your Digital Bookshelf, Reimagined.",
                        style = MaterialTheme.typography.titleLarge.copy(fontSize = 24.sp),
                    )
                    AppMutedText(
                        text =
                            if (isOnline) {
                                "Sign in to browse your Google Drive library, download books for offline reading, and pick up where you left off."
                            } else {
                                "You're offline. Download books when online to read them here later."
                            },
                    )
                    AppMutedText("Offline Reading • Bookmarks • Progress")
                }
            }

            Spacer(Modifier.weight(1f, fill = true))

            AppCard(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .widthIn(max = 420.dp)
                        .align(Alignment.CenterHorizontally),
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Sign in to access your library",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    AppMutedText("Sign in to view and manage your books.")

                    AppPrimaryButton(
                        text = if (isOnline) "Sign in" else "Offline",
                        enabled = isOnline,
                        onClick = onSignIn,
                        icon = { Icon(Icons.Outlined.Login, contentDescription = null, modifier = Modifier.size(18.dp)) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            Spacer(Modifier.weight(1f, fill = true))
        }
    }
}

private data class DriveBookCardData(
    val file: DriveService.DriveFile,
    val cachedEntry: CachedBookEntry?,
    val coverFile: File?,
    val parentFolderId: String? = null,
    val parentFolderName: String? = null,
)

private fun coverFileForCached(bookCache: BookCache, entry: CachedBookEntry?): File? {
    if (entry == null) return null
    val path = entry.coverPath
    if (!path.isNullOrBlank()) {
        val direct = File(bookCache.bookDir(entry.id), path)
        if (direct.exists()) return direct
    }
    return bookCache.findCoverFile(entry.id)
}

private fun DriveService.DriveFile.isFolder(): Boolean =
    mimeType?.equals("application/vnd.google-apps.folder", ignoreCase = true) == true

private fun DriveService.DriveFile.isEpub(): Boolean {
    if (name.endsWith(".epub", ignoreCase = true)) return true
    val mt = mimeType ?: return false
    return mt.equals("application/epub+zip", ignoreCase = true) || mt.contains("epub", ignoreCase = true)
}

private fun DriveService.DriveFile.isPdf(): Boolean {
    if (name.endsWith(".pdf", ignoreCase = true)) return true
    val mt = mimeType ?: return false
    return mt.equals("application/pdf", ignoreCase = true) || mt.contains("pdf", ignoreCase = true)
}

private fun DriveService.DriveFile.isTxt(): Boolean {
    if (name.endsWith(".txt", ignoreCase = true)) return true
    val mt = mimeType ?: return false
    return mt.equals("text/plain", ignoreCase = true) || mt.startsWith("text/", ignoreCase = true)
}

private fun DriveService.DriveFile.isSupportedBook(): Boolean = isEpub() || isPdf() || isTxt()

private suspend fun downloadDriveFileTo(
    http: HttpClient,
    jwt: String,
    fileId: String,
    dest: File,
): Boolean {
    val res =
        http.get("${Config.baseUrl}/drive/download/$fileId") {
            headers.append("Authorization", "Bearer $jwt")
        }
    if (!res.status.isSuccess()) return false

    dest.parentFile?.mkdirs()
    val channel = res.bodyAsChannel()
    return withContext(Dispatchers.IO) {
        dest.outputStream().use { os ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = channel.readAvailable(buffer, 0, buffer.size)
                if (read == -1) break
                os.write(buffer, 0, read)
            }
        }
        true
    }
}

private enum class ThumbnailDownloadResult {
    Success,
    NotFound,
    Failed,
}

private suspend fun downloadDriveThumbnailTo(
    http: HttpClient,
    jwt: String,
    fileId: String,
    dest: File,
    size: Int = 420,
): ThumbnailDownloadResult {
    val res =
        http.get("${Config.baseUrl}/drive/thumbnail/$fileId") {
            headers.append("Authorization", "Bearer $jwt")
            url { parameters.append("size", size.toString()) }
        }

    if (res.status.value == 404) return ThumbnailDownloadResult.NotFound
    if (!res.status.isSuccess()) return ThumbnailDownloadResult.Failed

    dest.parentFile?.mkdirs()
    val channel = res.bodyAsChannel()
    return withContext(Dispatchers.IO) {
        dest.outputStream().use { os ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = channel.readAvailable(buffer, 0, buffer.size)
                if (read == -1) break
                os.write(buffer, 0, read)
            }
        }
        if (dest.exists() && dest.length() > 0) ThumbnailDownloadResult.Success else ThumbnailDownloadResult.Failed
    }
}

private fun formatBytes(bytes: Long): String {
    val kb = 1024.0
    val mb = kb * 1024.0
    val gb = mb * 1024.0
    return when {
        bytes >= gb -> String.format(Locale.US, "%.2f GB", bytes / gb)
        bytes >= mb -> String.format(Locale.US, "%.1f MB", bytes / mb)
        bytes >= kb -> String.format(Locale.US, "%.0f KB", bytes / kb)
        else -> "$bytes B"
    }
}

private fun isoNowUtc(): String {
    val fmt =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
    return fmt.format(Date())
}

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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.BooksIndex
import com.progressivereader.kmp.offline.CachedBookEntry
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.settings.AppSettings
import io.ktor.client.HttpClient
import io.ktor.client.request.get
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
) {
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val isOnline = rememberIsOnline()
    val canUseDrive = isOnline && !sessionJwt.isNullOrBlank()

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

    val folderBooks = remember { mutableStateMapOf<String, List<DriveService.DriveFile>?>() }
    val folderLoading = remember { mutableStateMapOf<String, Boolean>() }

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

    suspend fun refreshDrive(force: Boolean = false) {
        error = null
        driveFetchFailed = false
        folderBooks.clear()
        folderLoading.clear()
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
            remoteFiles = res.getOrDefault(emptyList()).sortedBy { it.name.lowercase() }
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
            remoteFiles = appRes.getOrDefault(emptyList()).sortedBy { it.name.lowercase() }
            return
        }

        lastDriveRootFolderIdFetched = null
        remoteFiles = rootFiles.sortedBy { it.name.lowercase() }
    }

    fun cachedById(): Map<String, CachedBookEntry> =
        cachedIndex?.books?.associateBy { it.id }.orEmpty()

    suspend fun loadFolderBooks(folder: DriveService.DriveFile) {
        if (folderLoading[folder.id] == true) return
        folderLoading[folder.id] = true
        val result = runCatching { driveService.listFiles(folderId = folder.id) }
        val files =
            result
                .getOrDefault(emptyList())
                .filter { it.isEpub() }
                .sortedBy { it.name.lowercase() }
        folderBooks[folder.id] = files
        folderLoading[folder.id] = false
    }

    LaunchedEffect(Unit) { refreshCached() }
    LaunchedEffect(canUseDrive, settings.driveFolderId, settings.backendBaseUrl) { refreshDrive(force = false) }
    LaunchedEffect(sessionJwt, settings.driveFolderId) {
        initialFolderCollapseApplied = false
        collapsedShelves = setOf()
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
                        body = "Sign in to browse Drive and download new EPUBs.",
                        actionLabel = "Sign in",
                        onAction = onOpenLogin,
                    )
                }
                driveFetchFailed -> item {
                    InfoBanner(
                        icon = Icons.Outlined.CloudOff,
                        title = "Drive unavailable",
                        body = "Showing cached books only. Check backend URL in Settings.",
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
                    val folders = files.filter { it.isFolder() }
                    val rootEpubs = files.filter { it.isEpub() }

                    item {
                        ShelfSection(
                            title = "My Books",
                            subtitle = if (rootEpubs.isEmpty()) "No EPUBs in root folder." else "${rootEpubs.size} books",
                            collapsed = collapsedShelves.contains("root"),
                            onToggle = {
                                collapsedShelves =
                                    if (collapsedShelves.contains("root")) collapsedShelves - "root" else collapsedShelves + "root"
                            },
                        ) {
                            BookGrid(
                                books =
                                    rootEpubs.map { file ->
                                        DriveBookCardData(
                                            file = file,
                                            cachedEntry = cachedById[file.id],
                                            coverFile = coverFileForCached(bookCache, cachedById[file.id]),
                                        )
                                    },
                                downloadingId = downloadingId,
                                onOpen = { onOpenReader(it) },
                                onDownload = { file, needsUpdate ->
                                    scope.launch {
                                        error = null
                                        downloadingId = file.id
                                        try {
                                            val ok =
                                                downloadDriveFileTo(
                                                    http = http,
                                                    jwt = sessionJwt!!,
                                                    fileId = file.id,
                                                    dest = bookCache.epubFile(file.id),
                                                )
                                            if (!ok) {
                                                error = "Download failed (${Config.baseUrl})."
                                                return@launch
                                            }

                                            if (needsUpdate) {
                                                bookCache.extractedDir(file.id).deleteRecursively()
                                            }

                                            epubRepository.extractIfNeeded(
                                                epubFile = bookCache.epubFile(file.id),
                                                extractedDir = bookCache.extractedDir(file.id),
                                            )

                                            val coverFile =
                                                epubRepository.extractCoverIfNeeded(
                                                    extractedDir = bookCache.extractedDir(file.id),
                                                    bookDir = bookCache.bookDir(file.id),
                                                )

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

                    items(folders, key = { it.id }) { folder ->
                        val collapsed = collapsedShelves.contains(folder.id)
                        val folderFiles = folderBooks[folder.id]
                        val isLoading = folderLoading[folder.id] == true

                        ShelfSection(
                            title = folder.name,
                            subtitle =
                                when {
                                    isLoading -> "Loading…"
                                    folderFiles == null -> "Tap to load"
                                    folderFiles.isEmpty() -> "No EPUBs"
                                    else -> "${folderFiles.size} books"
                                },
                            leadingIcon = { Icon(Icons.Outlined.Folder, contentDescription = null) },
                            collapsed = collapsed,
                            onToggle = {
                                collapsedShelves =
                                    if (collapsed) collapsedShelves - folder.id else collapsedShelves + folder.id
                                if (collapsed && folderFiles == null) {
                                    scope.launch { loadFolderBooks(folder) }
                                }
                            },
                        ) {
                            if (folderFiles == null) {
                                if (isLoading) {
                                    Box(modifier = Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) {
                                        CircularProgressIndicator()
                                    }
                                }
                            } else {
                                BookGrid(
                                    books =
                                        folderFiles.map { file ->
                                            DriveBookCardData(
                                                file = file,
                                                cachedEntry = cachedById[file.id],
                                                coverFile = coverFileForCached(bookCache, cachedById[file.id]),
                                                parentFolderId = folder.id,
                                                parentFolderName = folder.name,
                                            )
                                        },
                                    downloadingId = downloadingId,
                                    onOpen = { onOpenReader(it) },
                                    onDownload = { file, needsUpdate ->
                                        scope.launch {
                                            error = null
                                            downloadingId = file.id
                                            try {
                                                val ok =
                                                    downloadDriveFileTo(
                                                        http = http,
                                                        jwt = sessionJwt!!,
                                                        fileId = file.id,
                                                        dest = bookCache.epubFile(file.id),
                                                    )
                                                if (!ok) {
                                                    error = "Download failed (${Config.baseUrl})."
                                                    return@launch
                                                }

                                                if (needsUpdate) {
                                                    bookCache.extractedDir(file.id).deleteRecursively()
                                                }

                                                epubRepository.extractIfNeeded(
                                                    epubFile = bookCache.epubFile(file.id),
                                                    extractedDir = bookCache.extractedDir(file.id),
                                                )

                                            val coverFile =
                                                epubRepository.extractCoverIfNeeded(
                                                    extractedDir = bookCache.extractedDir(file.id),
                                                    bookDir = bookCache.bookDir(file.id),
                                                )

                                                val now = isoNowUtc()
                                                val existing = bookCache.loadIndex()
                                                val entry =
                                                    CachedBookEntry(
                                                        id = file.id,
                                                        name = file.name,
                                                        mimeType = file.mimeType,
                                                        size = file.size,
                                                        modifiedTime = file.modifiedTime,
                                                        parentFolderId = folder.id,
                                                        parentFolderName = folder.name,
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
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
private fun BookGrid(
    books: List<DriveBookCardData>,
    downloadingId: String?,
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
                val coverPath = item.coverFile?.absolutePath?.takeIf { item.coverFile.exists() }

                LibraryBookCard(
                    modifier = Modifier.width(cardWidth),
                    title = item.file.name,
                    coverPath = coverPath,
                    isCached = isCached,
                    needsUpdate = needsUpdate,
                    isBusy = downloadingId == item.file.id,
                    sizeText = item.file.size?.let { formatBytes(it) },
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
    title: String,
    coverPath: String?,
    isCached: Boolean,
    needsUpdate: Boolean,
    isBusy: Boolean,
    sizeText: String?,
    onOpen: () -> Unit,
    onDownload: () -> Unit,
) {
    AppCard(
        modifier =
            modifier
                .fillMaxWidth()
                .clickable(enabled = isCached && !isBusy) { onOpen() },
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            CoverArt(
                coverPath = coverPath,
                title = title,
                modifier = Modifier.fillMaxWidth().aspectRatio(3f / 4f),
            )

            Text(
                text = title,
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
        cachedIndex.books.isEmpty() -> item { AppMutedText("No cached books yet. Go online and download an EPUB.") }
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
                                "Sign in to browse your Google Drive library, download EPUBs for offline reading, and pick up where you left off."
                            } else {
                                "You're offline. Download EPUBs when online to read them here later."
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

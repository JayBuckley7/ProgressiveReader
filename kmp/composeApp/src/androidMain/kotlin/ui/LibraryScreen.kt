package com.progressivereader.kmp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Update
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.BooksIndex
import com.progressivereader.kmp.offline.CachedBookEntry
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    settings: AppSettings,
    sessionJwt: String?,
    bookCache: BookCache,
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

    val showDrive = canUseDrive && !driveFetchFailed

    suspend fun refreshCached() {
        cachedIndex = bookCache.loadIndex()
    }

    suspend fun refreshDrive() {
        remoteFiles = null
        error = null
        driveFetchFailed = false
        if (!canUseDrive) return

        val result = runCatching { driveService.listFiles(folderId = settings.driveFolderId) }
        result.onFailure { t ->
            error = t.message ?: "Failed to load Drive library"
            driveFetchFailed = true
        }
        if (driveFetchFailed) return

        remoteFiles =
            result
                .getOrDefault(emptyList())
                .filter { it.isEpub() }
                .sortedBy { it.name.lowercase() }
    }

    LaunchedEffect(Unit) { refreshCached() }
    LaunchedEffect(canUseDrive, settings.driveFolderId, settings.backendBaseUrl) { refreshDrive() }

    fun cachedById(): Map<String, CachedBookEntry> =
        cachedIndex?.books?.associateBy { it.id }.orEmpty()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Library") },
                actions = {
                    if (showDrive) {
                        IconButton(
                            onClick = { scope.launch { refreshDrive() } },
                        ) { Icon(Icons.Outlined.Refresh, contentDescription = "Refresh") }
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Settings")
                    }
                    if (sessionJwt.isNullOrBlank()) {
                        IconButton(onClick = onOpenLogin) {
                            Icon(Icons.Outlined.Login, contentDescription = "Sign in")
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
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
                cachedBooksSection(
                    cachedIndex = cachedIndex,
                    onOpenReader = onOpenReader,
                )
                return@LazyColumn
            }

            item { Text("Drive (EPUB only)", style = MaterialTheme.typography.titleMedium) }

            when {
                files == null -> item { CircularProgressIndicator() }
                files.isEmpty() -> item { Text("No EPUB files found.") }
                else -> items(files, key = { it.id }) { f ->
                    val cachedEntry = cachedById[f.id]
                    val isCached = cachedEntry != null && bookCache.epubFile(f.id).exists()
                    val needsUpdate =
                        isCached && !f.modifiedTime.isNullOrBlank() && f.modifiedTime != cachedEntry?.modifiedTime

                    DriveBookCard(
                        file = f,
                        isCached = isCached,
                        needsUpdate = needsUpdate,
                        isBusy = downloadingId == f.id,
                        onOpen = { onOpenReader(f.id) },
                        onDownload = {
                            scope.launch {
                                error = null
                                downloadingId = f.id
                                try {
                                    val ok =
                                        downloadDriveFileTo(
                                            http = http,
                                            jwt = sessionJwt!!,
                                            fileId = f.id,
                                            dest = bookCache.epubFile(f.id),
                                        )
                                    if (!ok) {
                                        error = "Download failed (${Config.baseUrl})."
                                        return@launch
                                    }

                                    if (needsUpdate) {
                                        bookCache.extractedDir(f.id).deleteRecursively()
                                    }

                                    val now = isoNowUtc()
                                    val existing = bookCache.loadIndex()
                                    val entry =
                                        CachedBookEntry(
                                            id = f.id,
                                            name = f.name,
                                            mimeType = f.mimeType,
                                            size = f.size,
                                            modifiedTime = f.modifiedTime,
                                            cachedAt = now,
                                            lastOpenedAt = cachedEntry?.lastOpenedAt,
                                        )
                                    val updated =
                                        existing.copy(
                                            updatedAt = now,
                                            books = existing.books.filterNot { it.id == f.id } + entry,
                                        )
                                    bookCache.saveIndex(updated)
                                    cachedIndex = updated
                                    snackbarHostState.showSnackbar(if (needsUpdate) "Updated download" else "Downloaded")

                                    onOpenReader(f.id)
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

private fun LazyListScope.cachedBooksSection(
    cachedIndex: BooksIndex?,
    onOpenReader: (String) -> Unit,
) {
    item { Text("Cached books", style = MaterialTheme.typography.titleMedium) }

    when {
        cachedIndex == null -> item { CircularProgressIndicator() }
        cachedIndex.books.isEmpty() -> item { Text("No cached books yet. Go online and download an EPUB.") }
        else -> {
            val books =
                cachedIndex.books.sortedWith(
                    compareByDescending<CachedBookEntry> { it.lastOpenedAt ?: "" }.thenBy { it.name.lowercase() },
                )

            items(books, key = { it.id }) { b ->
                Card(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .clickable { onOpenReader(b.id) },
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(b.name, style = MaterialTheme.typography.titleMedium)
                        b.lastOpenedAt?.let {
                            Text("Last opened: $it", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DriveBookCard(
    file: DriveService.DriveFile,
    isCached: Boolean,
    needsUpdate: Boolean,
    isBusy: Boolean,
    onOpen: () -> Unit,
    onDownload: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = file.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    AssistChip(onClick = {}, label = { Text(if (isCached) "Cached" else "Not cached") })
                    if (needsUpdate) {
                        AssistChip(onClick = {}, label = { Text("Update available") })
                    }
                }

                val sizeText = file.size?.let { formatBytes(it) }
                if (sizeText != null) {
                    Text(sizeText, style = MaterialTheme.typography.bodySmall)
                }
            }

            when {
                isBusy -> CircularProgressIndicator(strokeWidth = 2.dp)
                isCached -> {
                    OutlinedButton(onClick = onOpen) { Text("Open") }
                    if (needsUpdate) {
                        IconButton(onClick = onDownload) {
                            Icon(Icons.Outlined.Update, contentDescription = "Update")
                        }
                    }
                }

                else -> {
                    FilledTonalButton(onClick = onDownload) {
                        Icon(Icons.Outlined.Download, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Download")
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoBanner(
    icon: ImageVector,
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(icon, contentDescription = null)
                Text(title, style = MaterialTheme.typography.titleMedium)
            }
            Text(body, style = MaterialTheme.typography.bodyMedium)
            if (!actionLabel.isNullOrBlank() && onAction != null) {
                FilledTonalButton(onClick = onAction) { Text(actionLabel) }
            }
        }
    }
}

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

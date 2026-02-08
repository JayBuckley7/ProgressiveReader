package com.progressivereader.kmp.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Update
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.progressivereader.kmp.domain.library.CachedBook
import com.progressivereader.kmp.domain.library.DriveFile
import com.progressivereader.kmp.domain.library.LibraryIndex
import com.progressivereader.kmp.domain.library.isFolder
import com.progressivereader.kmp.domain.library.isPdf
import com.progressivereader.kmp.domain.library.isSupportedBook
import com.progressivereader.kmp.domain.library.isTxt
import com.progressivereader.kmp.ui.viewmodels.LibraryUiState
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun LibraryScreen(
    state: LibraryUiState,
    snackbarHostState: SnackbarHostState,
    onOpenReader: (bookId: String) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenLogin: () -> Unit,
    onRefreshDrive: (force: Boolean) -> Unit,
    onImportUri: (uriString: String) -> Unit,
    onDownload: (file: DriveFile, needsUpdate: Boolean, parentFolderId: String?, parentFolderName: String?) -> Unit,
    onEnsureRemoteCover: (file: DriveFile, cachedEntry: CachedBook?) -> Unit,
    onCreateFolder: (name: String) -> Unit,
    onRenameFolder: (folderId: String, name: String) -> Unit,
    onDeleteFolder: (folderId: String) -> Unit,
    onMoveBookToFolder: (bookId: String, folderId: String?) -> Unit,
    onSetCover: (bookId: String, imageUriString: String) -> Unit,
    onRemoveCover: (bookId: String) -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val canUseDrive = state.isOnline && !state.sessionJwt.isNullOrBlank()
    val showDrive = canUseDrive && !state.driveFetchFailed

    val showSignedOutLanding =
        state.sessionJwt.isNullOrBlank() &&
            state.cachedIndex != null &&
            state.cachedIndex.books.isEmpty()

    var collapsedShelves by remember { mutableStateOf(setOf<String>()) }
    var initialFolderCollapseApplied by remember { mutableStateOf(false) }

    var showFolderManager by remember { mutableStateOf(false) }
    var showCreateFolderDialog by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }
    var renameFolderId by remember { mutableStateOf<String?>(null) }
    var renameFolderName by remember { mutableStateOf("") }
    var deleteFolderId by remember { mutableStateOf<String?>(null) }
    var moveBookTargetId by remember { mutableStateOf<String?>(null) }

    var coverPickerTargetBookId by remember { mutableStateOf<String?>(null) }

    val importLauncher =
        rememberLauncherForActivityResult(contract = ActivityResultContracts.GetContent()) { uri ->
            if (uri == null) return@rememberLauncherForActivityResult
            onImportUri(uri.toString())
        }

    val coverLauncher =
        rememberLauncherForActivityResult(contract = ActivityResultContracts.GetContent()) { uri ->
            val bookId = coverPickerTargetBookId
            coverPickerTargetBookId = null
            if (uri == null || bookId.isNullOrBlank()) return@rememberLauncherForActivityResult
            onSetCover(bookId, uri.toString())
        }

    LaunchedEffect(state.sessionJwt, state.driveFolderIdOverride) {
        initialFolderCollapseApplied = false
        collapsedShelves = setOf()
    }

    LaunchedEffect(state.remoteFiles) {
        val files = state.remoteFiles ?: return@LaunchedEffect
        if (initialFolderCollapseApplied) return@LaunchedEffect
        collapsedShelves = files.filter { it.isFolder() }.map { it.id }.toSet()
        initialFolderCollapseApplied = true
    }

    if (showFolderManager) {
        ModalBottomSheet(onDismissRequest = { showFolderManager = false }) {
            val entries =
                state.virtualFolderNameById
                    .entries
                    .filter { !it.value.trim().equals("JLPT", ignoreCase = true) }
                    .sortedBy { it.value.lowercase() }

            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Folders", style = MaterialTheme.typography.titleMedium)
                        AppMutedText("Organize books with virtual folders stored in metadata.json.")
                    }
                    if (state.isUpdatingMetadata) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    }
                }

                AppPrimaryButton(
                    text = "New folder",
                    enabled = !state.isUpdatingMetadata,
                    onClick = { showCreateFolderDialog = true },
                )

                if (entries.isEmpty()) {
                    AppMutedText("No folders yet.")
                } else {
                    entries.forEach { (folderId, name) ->
                        val count = state.virtualFolderIdByBookId.values.count { it == folderId }
                        AppCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(name, style = MaterialTheme.typography.titleSmall)
                                    AppMutedText("$count books")
                                }
                                IconButton(
                                    enabled = !state.isUpdatingMetadata,
                                    onClick = {
                                        renameFolderId = folderId
                                        renameFolderName = name
                                    },
                                ) {
                                    Icon(Icons.Outlined.Edit, contentDescription = "Rename folder")
                                }
                                IconButton(
                                    enabled = !state.isUpdatingMetadata,
                                    onClick = { deleteFolderId = folderId },
                                ) {
                                    Icon(Icons.Outlined.Delete, contentDescription = "Delete folder")
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                AppOutlineButton(text = "Close", onClick = { showFolderManager = false })
            }
        }
    }

    if (showCreateFolderDialog) {
        AlertDialog(
            onDismissRequest = { showCreateFolderDialog = false },
            title = { Text("Create folder") },
            text = {
                OutlinedTextField(
                    value = newFolderName,
                    onValueChange = { newFolderName = it },
                    label = { Text("Folder name") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    enabled = !state.isUpdatingMetadata,
                    onClick = {
                        val name = newFolderName
                        showCreateFolderDialog = false
                        newFolderName = ""
                        onCreateFolder(name)
                    },
                ) {
                    Text("Create")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateFolderDialog = false }) { Text("Cancel") }
            },
        )
    }

    val folderIdToRename = renameFolderId
    if (!folderIdToRename.isNullOrBlank()) {
        AlertDialog(
            onDismissRequest = { renameFolderId = null },
            title = { Text("Rename folder") },
            text = {
                OutlinedTextField(
                    value = renameFolderName,
                    onValueChange = { renameFolderName = it },
                    label = { Text("Folder name") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    enabled = !state.isUpdatingMetadata,
                    onClick = {
                        val name = renameFolderName
                        renameFolderId = null
                        renameFolderName = ""
                        onRenameFolder(folderIdToRename, name)
                    },
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(
                    enabled = !state.isUpdatingMetadata,
                    onClick = {
                        renameFolderId = null
                        renameFolderName = ""
                    },
                ) {
                    Text("Cancel")
                }
            },
        )
    }

    val folderIdToDelete = deleteFolderId
    if (!folderIdToDelete.isNullOrBlank()) {
        val name = state.virtualFolderNameById[folderIdToDelete] ?: folderIdToDelete
        AlertDialog(
            onDismissRequest = { deleteFolderId = null },
            title = { Text("Delete folder") },
            text = { Text("Delete \"$name\"? Books in this folder will be moved to My Books.") },
            confirmButton = {
                TextButton(
                    enabled = !state.isUpdatingMetadata,
                    onClick = {
                        deleteFolderId = null
                        onDeleteFolder(folderIdToDelete)
                    },
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteFolderId = null }) { Text("Cancel") }
            },
        )
    }

    val moveBookId = moveBookTargetId
    if (!moveBookId.isNullOrBlank()) {
        ModalBottomSheet(onDismissRequest = { moveBookTargetId = null }) {
            val currentFolderId = state.virtualFolderIdByBookId[moveBookId]
            val entries =
                state.virtualFolderNameById
                    .entries
                    .filter { !it.value.trim().equals("JLPT", ignoreCase = true) }
                    .sortedBy { it.value.lowercase() }

            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Move to folder", style = MaterialTheme.typography.titleMedium)
                AppMutedText("This updates metadata.json only (no Drive folders are changed).")

                AppCard(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !state.isUpdatingMetadata) {
                                moveBookTargetId = null
                                onMoveBookToFolder(moveBookId, null)
                            },
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("My Books", modifier = Modifier.weight(1f))
                        if (currentFolderId.isNullOrBlank()) AppChip("Current")
                    }
                }

                entries.forEach { (folderId, name) ->
                    AppCard(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !state.isUpdatingMetadata) {
                                    moveBookTargetId = null
                                    onMoveBookToFolder(moveBookId, folderId)
                                },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(name, modifier = Modifier.weight(1f))
                            if (currentFolderId == folderId) AppChip("Current")
                        }
                    }
                }

                if (state.isUpdatingMetadata) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                        AppMutedText("Updating…")
                    }
                }
            }
        }
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
                        IconButton(
                            enabled = !state.isUpdatingMetadata && state.downloadingId == null && !state.isImporting,
                            onClick = { showFolderManager = true },
                        ) {
                            Icon(Icons.Outlined.Folder, contentDescription = "Manage folders")
                        }
                        IconButton(onClick = { onRefreshDrive(true) }) {
                            Icon(Icons.Outlined.Refresh, contentDescription = "Refresh")
                        }
                    }

                    if (state.isImporting) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp).size(18.dp),
                        )
                    } else {
                        IconButton(
                            enabled = state.downloadingId == null,
                            onClick = { importLauncher.launch("*/*") },
                        ) {
                            Icon(Icons.Outlined.CloudUpload, contentDescription = "Upload book")
                        }
                    }

                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Settings")
                    }

                    if (state.sessionJwt.isNullOrBlank()) {
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
                isOnline = state.isOnline,
                onSignIn = onOpenLogin,
            )
            return@Scaffold
        }

        val files = state.remoteFiles
        val cachedById = state.cachedIndex?.books?.associateBy { it.id }.orEmpty()

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                !state.isOnline ->
                    item {
                        InfoBanner(
                            icon = Icons.Outlined.CloudOff,
                            title = "Offline",
                            body = "Showing cached books only.",
                        )
                    }

                state.sessionJwt.isNullOrBlank() ->
                    item {
                        InfoBanner(
                            icon = Icons.Outlined.Login,
                            title = "Guest mode",
                            body = "Sign in to browse Drive and download new books.",
                            actionLabel = "Sign in",
                            onAction = onOpenLogin,
                        )
                    }

                state.driveFetchFailed ->
                    item {
                        InfoBanner(
                            icon = Icons.Outlined.CloudOff,
                            title = "Drive unavailable",
                            body = "Showing cached books only. Check your connection or reload from Settings.",
                        )
                    }
            }

            state.error?.let { msg ->
                item { Text(msg, color = MaterialTheme.colorScheme.error) }
            }

            if (!showDrive) {
                cachedShelves(
                    cachedIndex = state.cachedIndex,
                    localCoverPathByBookId = state.localCoverPathByBookId,
                    onOpenReader = onOpenReader,
                )
                return@LazyColumn
            }

            when {
                files == null -> item { CircularProgressIndicator() }
                files.isEmpty() -> item { Text("No files found.") }
                else -> {
                    val allBooks = files.filter { it.isSupportedBook() }
                    val allBookIds = allBooks.map { it.id }.toSet()
                    val visibleFolders =
                        state.virtualFolderNameById
                            .filterValues { name -> !name.trim().equals("JLPT", ignoreCase = true) }
                    val knownFolderIds = visibleFolders.keys

                    val uncategorizedBooks =
                        allBooks.filter { file ->
                            val folderId = state.virtualFolderIdByBookId[file.id]
                            folderId.isNullOrBlank() || !knownFolderIds.contains(folderId)
                        }

                    val folderShelves =
                        visibleFolders
                            .entries
                            .sortedBy { it.value.lowercase() }
                            .map { (folderId, name) ->
                                folderId to allBooks.filter { f -> state.virtualFolderIdByBookId[f.id] == folderId }
                            }

                    item {
                        ShelfSection(
                            title = "My Books",
                            subtitle = if (uncategorizedBooks.isEmpty()) "No books." else "${uncategorizedBooks.size} books",
                            collapsed = collapsedShelves.contains("root"),
                            onToggle = {
                                collapsedShelves =
                                    if (collapsedShelves.contains("root")) {
                                        collapsedShelves - "root"
                                    } else {
                                        collapsedShelves + "root"
                                    }
                            },
                        ) {
                            BookGrid(
                                books =
                                    uncategorizedBooks.map { file ->
                                        val cached = cachedById[file.id]
                                        DriveBookCardData(
                                            file = file,
                                            cachedEntry = cached,
                                            localCoverPath = state.localCoverPathByBookId[file.id],
                                            remoteCoverPath = state.remoteCoverPathByBookId[file.id],
                                            remoteCoverAttempted = state.remoteCoverPathByBookId.containsKey(file.id),
                                            hasCustomCover = !state.coverImageIdByBookId[file.id].isNullOrBlank(),
                                            parentFolderId = null,
                                            parentFolderName = null,
                                        )
                                    },
                                downloadingId = state.downloadingId,
                                onEnsureRemoteCover = onEnsureRemoteCover,
                                onOpen = { onOpenReader(it) },
                                onDownload = { file, needsUpdate, parentFolderId, parentFolderName ->
                                    onDownload(file, needsUpdate, parentFolderId, parentFolderName)
                                },
                                onMoveToFolder = { id -> moveBookTargetId = id },
                                onSetCover = { id ->
                                    coverPickerTargetBookId = id
                                    coverLauncher.launch("image/*")
                                },
                                onRemoveCover = { id -> onRemoveCover(id) },
                            )
                        }
                    }

                    items(folderShelves, key = { it.first }) { (folderId, folderFiles) ->
                        val collapsed = collapsedShelves.contains(folderId)
                        ShelfSection(
                            title = visibleFolders[folderId] ?: folderId,
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
                                        val cached = cachedById[file.id]
                                        DriveBookCardData(
                                            file = file,
                                            cachedEntry = cached,
                                            localCoverPath = state.localCoverPathByBookId[file.id],
                                            remoteCoverPath = state.remoteCoverPathByBookId[file.id],
                                            remoteCoverAttempted = state.remoteCoverPathByBookId.containsKey(file.id),
                                            hasCustomCover = !state.coverImageIdByBookId[file.id].isNullOrBlank(),
                                            parentFolderId = folderId,
                                            parentFolderName = visibleFolders[folderId],
                                        )
                                    },
                                downloadingId = state.downloadingId,
                                onEnsureRemoteCover = onEnsureRemoteCover,
                                onOpen = { onOpenReader(it) },
                                onDownload = { file, needsUpdate, parentFolderId, parentFolderName ->
                                    onDownload(file, needsUpdate, parentFolderId, parentFolderName)
                                },
                                onMoveToFolder = { id -> moveBookTargetId = id },
                                onSetCover = { id ->
                                    coverPickerTargetBookId = id
                                    coverLauncher.launch("image/*")
                                },
                                onRemoveCover = { id -> onRemoveCover(id) },
                            )
                        }
                    }

                    // Always show cached-only books (e.g. imported locally or cached while offline).
                    val localOnly =
                        state.cachedIndex
                            ?.books
                            ?.filter { it.id !in allBookIds }
                            ?.sortedBy { it.name.lowercase() }
                            .orEmpty()

                    if (localOnly.isNotEmpty()) {
                        item {
                            ShelfSection(
                                title = "On this device",
                                subtitle = "${localOnly.size} books",
                                collapsed = false,
                                onToggle = {},
                            ) {
                                BookGrid(
                                    books =
                                        localOnly.map { b ->
                                            DriveBookCardData(
                                                file =
                                                    DriveFile(
                                                        id = b.id,
                                                        name = b.name,
                                                        mimeType = b.mimeType,
                                                        size = b.size,
                                                        modifiedTime = b.modifiedTime,
                                                    ),
                                                cachedEntry = b,
                                                localCoverPath = state.localCoverPathByBookId[b.id],
                                                remoteCoverPath = null,
                                                remoteCoverAttempted = true,
                                                hasCustomCover = false,
                                                parentFolderId = null,
                                                parentFolderName = null,
                                            )
                                        },
                                    downloadingId = null,
                                    onEnsureRemoteCover = { _, _ -> },
                                    onOpen = { onOpenReader(it) },
                                    onDownload = { _, _, _, _ -> },
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
    onEnsureRemoteCover: (DriveFile, CachedBook?) -> Unit,
    onOpen: (String) -> Unit,
    onDownload: (DriveFile, Boolean, String?, String?) -> Unit,
    onMoveToFolder: ((String) -> Unit)? = null,
    onSetCover: ((String) -> Unit)? = null,
    onRemoveCover: ((String) -> Unit)? = null,
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

                val coverPath =
                    if (item.hasCustomCover) {
                        item.remoteCoverPath ?: item.localCoverPath
                    } else {
                        item.localCoverPath ?: item.remoteCoverPath
                    }

                LibraryBookCard(
                    modifier = Modifier.width(cardWidth),
                    file = item.file,
                    cachedEntry = cachedEntry,
                    coverPath = coverPath,
                    hasCustomCover = item.hasCustomCover,
                    isCached = isCached,
                    needsUpdate = needsUpdate,
                    isBusy = downloadingId == item.file.id,
                    sizeText = item.file.size?.let { formatBytes(it) },
                    remoteCoverAttempted = item.remoteCoverAttempted,
                    onEnsureRemoteCover = onEnsureRemoteCover,
                    onOpen = { onOpen(item.file.id) },
                    onDownload = { onDownload(item.file, needsUpdate, item.parentFolderId, item.parentFolderName) },
                    onMoveToFolder = onMoveToFolder?.let { cb -> { cb(item.file.id) } },
                    onSetCover = onSetCover?.let { cb -> { cb(item.file.id) } },
                    onRemoveCover = onRemoveCover?.takeIf { item.hasCustomCover }?.let { cb -> { cb(item.file.id) } },
                )
            }
        }
    }
}

@Composable
private fun LibraryBookCard(
    modifier: Modifier = Modifier,
    file: DriveFile,
    cachedEntry: CachedBook?,
    coverPath: String?,
    hasCustomCover: Boolean,
    isCached: Boolean,
    needsUpdate: Boolean,
    isBusy: Boolean,
    sizeText: String?,
    remoteCoverAttempted: Boolean,
    onEnsureRemoteCover: (DriveFile, CachedBook?) -> Unit,
    onOpen: () -> Unit,
    onDownload: () -> Unit,
    onMoveToFolder: (() -> Unit)?,
    onSetCover: (() -> Unit)?,
    onRemoveCover: (() -> Unit)?,
) {
    LaunchedEffect(file.id, remoteCoverAttempted, coverPath, hasCustomCover) {
        if (remoteCoverAttempted) return@LaunchedEffect
        // If a custom cover is configured via metadata.json, fetch it even if we have a local
        // extracted cover as a fallback.
        if (!hasCustomCover && coverPath != null) return@LaunchedEffect
        onEnsureRemoteCover(file, cachedEntry)
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

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = file.name,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )

                val menuEnabled = onMoveToFolder != null || onSetCover != null || onRemoveCover != null
                if (menuEnabled) {
                    var expanded by remember(file.id) { mutableStateOf(false) }
                    IconButton(onClick = { expanded = true }) {
                        Icon(Icons.Outlined.MoreVert, contentDescription = "More")
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        if (onMoveToFolder != null) {
                            DropdownMenuItem(
                                text = { Text("Move to folder") },
                                onClick = {
                                    expanded = false
                                    onMoveToFolder()
                                },
                                leadingIcon = { Icon(Icons.Outlined.Folder, contentDescription = null) },
                            )
                        }
                        if (onSetCover != null) {
                            DropdownMenuItem(
                                text = { Text("Set cover image") },
                                onClick = {
                                    expanded = false
                                    onSetCover()
                                },
                                leadingIcon = { Icon(Icons.Outlined.Image, contentDescription = null) },
                            )
                        }
                        if (onRemoveCover != null) {
                            DropdownMenuItem(
                                text = { Text("Remove custom cover") },
                                onClick = {
                                    expanded = false
                                    onRemoveCover()
                                },
                                leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null) },
                            )
                        }
                    }
                }
            }

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
    cachedIndex: LibraryIndex?,
    localCoverPathByBookId: Map<String, String?>,
    onOpenReader: (String) -> Unit,
) {
    when {
        cachedIndex == null -> item { CircularProgressIndicator() }
        cachedIndex.books.isEmpty() -> item { AppMutedText("No cached books yet. Go online and download a book.") }
        else -> {
            val grouped = cachedIndex.books.groupBy { it.parentFolderName ?: "My Books" }
            val orderedKeys = listOf("My Books") + grouped.keys.filter { it != "My Books" }.sorted()

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
                                            DriveFile(
                                                id = b.id,
                                                name = b.name,
                                                mimeType = b.mimeType,
                                                size = b.size,
                                                modifiedTime = b.modifiedTime,
                                            ),
                                        cachedEntry = b,
                                        localCoverPath = localCoverPathByBookId[b.id],
                                        remoteCoverPath = null,
                                        remoteCoverAttempted = true,
                                        hasCustomCover = false,
                                        parentFolderId = null,
                                        parentFolderName = null,
                                    )
                                },
                            downloadingId = null,
                            onEnsureRemoteCover = { _, _ -> },
                            onOpen = { onOpenReader(it) },
                            onDownload = { _, _, _, _ -> },
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
    val file: DriveFile,
    val cachedEntry: CachedBook?,
    val localCoverPath: String?,
    val remoteCoverPath: String?,
    val remoteCoverAttempted: Boolean,
    val hasCustomCover: Boolean,
    val parentFolderId: String? = null,
    val parentFolderName: String? = null,
)

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

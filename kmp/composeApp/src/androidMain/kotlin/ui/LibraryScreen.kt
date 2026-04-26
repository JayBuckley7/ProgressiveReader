package com.progressivereader.kmp.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.domain.library.CachedBook
import com.progressivereader.kmp.domain.library.DriveFile
import com.progressivereader.kmp.ui.viewmodels.LibraryUiState

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
    val showDrive = canUseDrive && (state.remoteFiles != null || !state.driveFetchFailed)
    val showSignedOutLanding =
        state.sessionJwt.isNullOrBlank() &&
            state.cachedIndex != null &&
            state.cachedIndex.books.isEmpty()

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
            if (uri != null) onImportUri(uri.toString())
        }
    val coverLauncher =
        rememberLauncherForActivityResult(contract = ActivityResultContracts.GetContent()) { uri ->
            val bookId = coverPickerTargetBookId
            coverPickerTargetBookId = null
            if (uri != null && !bookId.isNullOrBlank()) {
                onSetCover(bookId, uri.toString())
            }
        }

    if (showFolderManager) {
        FolderManagerSheet(
            state = state,
            onDismiss = { showFolderManager = false },
            onCreateFolder = { showCreateFolderDialog = true },
            onRenameFolder = { folderId, name ->
                renameFolderId = folderId
                renameFolderName = name
            },
            onDeleteFolder = { folderId -> deleteFolderId = folderId },
        )
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
                TextButton(onClick = { showCreateFolderDialog = false }) {
                    Text("Cancel")
                }
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
            text = { Text("Delete \"$name\"? Books in this folder move back to My Books.") },
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
                TextButton(onClick = { deleteFolderId = null }) {
                    Text("Cancel")
                }
            },
        )
    }

    val moveBookId = moveBookTargetId
    if (!moveBookId.isNullOrBlank()) {
        MoveToFolderSheet(
            state = state,
            bookId = moveBookId,
            onDismiss = { moveBookTargetId = null },
            onMove = { folderId ->
                moveBookTargetId = null
                onMoveBookToFolder(moveBookId, folderId)
            },
        )
    }

    val driveShelves = remember(state) { if (showDrive) presentDriveShelves(state) else emptyList() }
    val cachedShelves = remember(state.cachedIndex, state.localCoverPathByBookId) { presentCachedShelves(state.cachedIndex, state.localCoverPathByBookId) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            AppShellTopBar(
                title = "Library",
                subtitle =
                    when {
                        showSignedOutLanding && state.isOnline -> "Sign in to load books from Drive."
                        showSignedOutLanding -> "Downloaded books stay available offline."
                        showDrive -> "Drive and downloaded books."
                        state.isOnline -> "Downloaded books on this device."
                        else -> "Offline mode."
                    },
                actions = {
                    if (showDrive) {
                        AppShellAction(
                            icon = Icons.Outlined.Folder,
                            contentDescription = "Manage folders",
                            modifier = Modifier.testTag(UiTestTags.libraryActionFolders),
                            enabled = !state.isUpdatingMetadata && state.downloadingId == null && !state.isImporting,
                            onClick = { showFolderManager = true },
                        )
                    }

                    if (canUseDrive) {
                        AppShellAction(
                            icon = Icons.Outlined.Refresh,
                            contentDescription = "Refresh library",
                            modifier = Modifier.testTag(UiTestTags.libraryActionRefresh),
                            enabled = !state.isImporting,
                            onClick = { onRefreshDrive(true) },
                        )
                    }

                    if (state.isImporting) {
                        CircularProgressIndicator(
                            strokeWidth = 2.dp,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp).size(18.dp),
                        )
                    } else {
                        AppShellAction(
                            icon = Icons.Outlined.CloudUpload,
                            contentDescription = "Import book",
                            modifier = Modifier.testTag(UiTestTags.libraryActionImport),
                            enabled = state.downloadingId == null,
                            onClick = { importLauncher.launch("*/*") },
                        )
                    }

                    AppShellAction(
                        icon = Icons.Outlined.Settings,
                        contentDescription = "Settings",
                        modifier = Modifier.testTag(UiTestTags.libraryActionSettings),
                        onClick = onOpenSettings,
                    )

                    if (state.sessionJwt.isNullOrBlank() && !showSignedOutLanding) {
                        AppShellAction(
                            icon = Icons.Outlined.Login,
                            contentDescription = "Sign in",
                            modifier = Modifier.testTag(UiTestTags.libraryActionSignIn),
                            onClick = onOpenLogin,
                        )
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

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            when {
                !state.isOnline ->
                    item {
                        InfoBanner(
                            tag = UiTestTags.libraryBannerOffline,
                            icon = Icons.Outlined.CloudOff,
                            title = "Offline",
                            body = "Showing downloaded books only.",
                        )
                    }

                state.sessionJwt.isNullOrBlank() ->
                    item {
                        InfoBanner(
                            tag = UiTestTags.libraryBannerGuest,
                            icon = Icons.Outlined.Login,
                            title = "Guest mode",
                            body = "Sign in to sync books from Drive.",
                            actionLabel = "Sign in",
                            onAction = onOpenLogin,
                        )
                    }

                state.driveFetchFailed ->
                    item {
                        InfoBanner(
                            tag = UiTestTags.libraryBannerDriveUnavailable,
                            icon = Icons.Outlined.CloudOff,
                            title = "Drive unavailable",
                            body = "Showing downloaded books while Drive is unavailable.",
                        )
                    }
            }

            state.error?.let { message ->
                item {
                    Text(
                        text = message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            if (!showDrive) {
                when {
                    state.cachedIndex == null ->
                        item { InlineLoadingState(message = "Loading downloaded books...") }

                    cachedShelves.isEmpty() ->
                        item {
                            EmptyLibraryState(
                                tag = UiTestTags.libraryEmptyState,
                                title = if (state.isOnline) "No books on this device" else "No downloaded books yet",
                                body =
                                    if (state.isOnline) {
                                        "Imported and downloaded books appear here."
                                    } else {
                                        "Downloaded books appear here once they are cached."
                                    },
                            )
                        }

                    else ->
                        items(cachedShelves, key = { it.key }) { shelf ->
                            ShelfSection(presentation = shelf) {
                                BookShelfRow(
                                    books = shelf.books,
                                    onEnsureRemoteCover = { _, _ -> },
                                    onOpen = { onOpenReader(it) },
                                    onDownload = { _, _, _, _ -> },
                                )
                            }
                        }
                }
                return@LazyColumn
            }

            when {
                state.remoteFiles == null ->
                    item { InlineLoadingState(message = "Refreshing library...") }

                driveShelves.none { shelf -> shelf.books.isNotEmpty() } ->
                    item {
                        EmptyLibraryState(
                            tag = UiTestTags.libraryEmptyState,
                            title = "No synced books found",
                            body = "No supported books were found in your ProgressiveReader Drive folder.",
                        )
                    }

                else ->
                    items(driveShelves, key = { it.key }) { shelf ->
                        ShelfSection(presentation = shelf) {
                            BookShelfRow(
                                books = shelf.books,
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
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FolderManagerSheet(
    state: LibraryUiState,
    onDismiss: () -> Unit,
    onCreateFolder: () -> Unit,
    onRenameFolder: (String, String) -> Unit,
    onDeleteFolder: (String) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        val entries =
            state.virtualFolderNameById
                .entries
                .filter { !it.value.trim().equals("JLPT", ignoreCase = true) }
                .sortedBy { it.value.lowercase() }

        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppSectionHeader(
                title = "Folders",
                subtitle = "Organize synced books with virtual shelves.",
            )

            AppPrimaryButton(
                text = "New folder",
                enabled = !state.isUpdatingMetadata,
                onClick = onCreateFolder,
                modifier = Modifier.fillMaxWidth(),
            )

            if (entries.isEmpty()) {
                AppMutedText("No folders yet.")
            } else {
                entries.forEach { (folderId, name) ->
                    val count = state.virtualFolderIdByBookId.values.count { it == folderId }
                    AppCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(name, style = MaterialTheme.typography.titleSmall)
                                AppMutedText(if (count == 1) "1 book" else "$count books")
                            }
                            IconButton(
                                enabled = !state.isUpdatingMetadata,
                                onClick = { onRenameFolder(folderId, name) },
                            ) {
                                Icon(Icons.Outlined.Edit, contentDescription = "Rename folder")
                            }
                            IconButton(
                                enabled = !state.isUpdatingMetadata,
                                onClick = { onDeleteFolder(folderId) },
                            ) {
                                Icon(Icons.Outlined.Delete, contentDescription = "Delete folder")
                            }
                        }
                    }
                }
            }

            if (state.isUpdatingMetadata) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    AppMutedText("Updating folders...")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MoveToFolderSheet(
    state: LibraryUiState,
    bookId: String,
    onDismiss: () -> Unit,
    onMove: (String?) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        val currentFolderId = state.virtualFolderIdByBookId[bookId]
        val entries =
            state.virtualFolderNameById
                .entries
                .filter { !it.value.trim().equals("JLPT", ignoreCase = true) }
                .sortedBy { it.value.lowercase() }

        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AppSectionHeader(
                title = "Move to folder",
                subtitle = "This updates metadata.json only.",
            )

            FolderChoiceRow(
                label = "My Books",
                selected = currentFolderId.isNullOrBlank(),
                enabled = !state.isUpdatingMetadata,
                onClick = { onMove(null) },
            )

            entries.forEach { (folderId, name) ->
                FolderChoiceRow(
                    label = name,
                    selected = currentFolderId == folderId,
                    enabled = !state.isUpdatingMetadata,
                    onClick = { onMove(folderId) },
                )
            }

            if (state.isUpdatingMetadata) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    AppMutedText("Updating folders...")
                }
            }
        }
    }
}

@Composable
private fun FolderChoiceRow(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled, onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color =
            if (selected) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
            } else {
                MaterialTheme.colorScheme.surface
            },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(text = label, modifier = Modifier.weight(1f))
            if (selected) AppChip("Current")
        }
    }
}

@Composable
private fun BookShelfRow(
    books: List<LibraryBookPresentation>,
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

    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(end = 20.dp),
    ) {
        items(books, key = { it.file.id }) { book ->
            LibraryBookTile(
                presentation = book,
                onEnsureRemoteCover = onEnsureRemoteCover,
                onOpen = { onOpen(book.file.id) },
                onDownload = { onDownload(book.file, book.needsUpdate, book.parentFolderId, book.parentFolderName) },
                onMoveToFolder = onMoveToFolder?.let { cb -> { cb(book.file.id) } },
                onSetCover = onSetCover?.let { cb -> { cb(book.file.id) } },
                onRemoveCover = onRemoveCover?.takeIf { book.hasCustomCover }?.let { cb -> { cb(book.file.id) } },
            )
        }
    }
}

@Composable
private fun LibraryBookTile(
    presentation: LibraryBookPresentation,
    onEnsureRemoteCover: (DriveFile, CachedBook?) -> Unit,
    onOpen: () -> Unit,
    onDownload: () -> Unit,
    onMoveToFolder: (() -> Unit)?,
    onSetCover: (() -> Unit)?,
    onRemoveCover: (() -> Unit)?,
) {
    LaunchedEffect(
        presentation.file.id,
        presentation.remoteCoverAttempted,
        presentation.coverPath,
        presentation.hasCustomCover,
    ) {
        if (presentation.remoteCoverAttempted) return@LaunchedEffect
        if (!presentation.hasCustomCover && presentation.coverPath != null) return@LaunchedEffect
        onEnsureRemoteCover(presentation.file, presentation.cachedEntry)
    }

    Column(
        modifier =
            Modifier
                .width(148.dp)
                .testTag(UiTestTags.libraryTile(presentation.file.id))
                .clickable(enabled = presentation.isCached && !presentation.isBusy, onClick = onOpen),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CoverArt(
            coverPath = presentation.coverPath,
            title = presentation.displayTitle,
            modifier = Modifier.fillMaxWidth().aspectRatio(3f / 4f),
            typeLabel = presentation.typeLabel,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = presentation.displayTitle,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )

            val showDownloadInMenu = !presentation.isCached && !presentation.isBusy
            val menuEnabled = showDownloadInMenu || onMoveToFolder != null || onSetCover != null || onRemoveCover != null
            if (menuEnabled) {
                var expanded by remember(presentation.file.id) { mutableStateOf(false) }
                IconButton(
                    onClick = { expanded = true },
                    modifier = Modifier.size(32.dp).testTag(UiTestTags.libraryOverflowMenu(presentation.file.id)),
                ) {
                    Icon(Icons.Outlined.MoreVert, contentDescription = "More actions")
                }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    if (showDownloadInMenu) {
                        DropdownMenuItem(
                            text = { Text("Download") },
                            onClick = {
                                expanded = false
                                onDownload()
                            },
                            modifier = Modifier.testTag(UiTestTags.libraryOverflowAction(presentation.file.id, "download")),
                            leadingIcon = { Icon(Icons.Outlined.Download, contentDescription = null) },
                        )
                    }
                    if (onMoveToFolder != null) {
                        DropdownMenuItem(
                            text = { Text("Move to folder") },
                            onClick = {
                                expanded = false
                                onMoveToFolder()
                            },
                            modifier = Modifier.testTag(UiTestTags.libraryOverflowAction(presentation.file.id, "move-folder")),
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
                            modifier = Modifier.testTag(UiTestTags.libraryOverflowAction(presentation.file.id, "set-cover")),
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
                            modifier = Modifier.testTag(UiTestTags.libraryOverflowAction(presentation.file.id, "remove-cover")),
                            leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null) },
                        )
                    }
                }
            }
        }

        AppMutedText(text = presentation.detailLine)

        if (presentation.isCached || presentation.isBusy) {
            BookActionRow(
                presentation = presentation,
                onOpen = onOpen,
                onDownload = onDownload,
            )
        }
    }
}

@Composable
private fun BookActionRow(
    presentation: LibraryBookPresentation,
    onOpen: () -> Unit,
    onDownload: () -> Unit,
) {
    when {
        presentation.isBusy ->
            Row(
                modifier = Modifier.fillMaxWidth().height(36.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                AppMutedText("Downloading...")
            }

        presentation.isCached && presentation.needsUpdate ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppPrimaryButton(
                    text = "Read",
                    modifier = Modifier.weight(1f).testTag(UiTestTags.libraryPrimaryAction(presentation.file.id)),
                    onClick = onOpen,
                )
                AppTonalButton(
                    text = "Update",
                    onClick = onDownload,
                    icon = { Icon(Icons.Outlined.Update, contentDescription = null, modifier = Modifier.size(16.dp)) },
                )
            }

        presentation.isCached ->
            AppPrimaryButton(
                text = "Read",
                modifier = Modifier.fillMaxWidth().testTag(UiTestTags.libraryPrimaryAction(presentation.file.id)),
                onClick = onOpen,
            )
    }
}

@Composable
private fun ShelfSection(
    presentation: LibraryShelfPresentation,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(UiTestTags.libraryShelf(presentation.title)),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppSectionHeader(
            title = presentation.title,
            subtitle = presentation.countLabel,
            trailing =
                if (presentation.isFolderShelf) {
                    {
                        Icon(
                            imageVector = Icons.Outlined.Folder,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    null
                },
        )
        content()
    }
}

@Composable
private fun InlineLoadingState(message: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        AppMutedText(message)
    }
}

@Composable
private fun EmptyLibraryState(
    tag: String,
    title: String,
    body: String,
) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(tag),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        AppMutedText(body)
    }
}

@Composable
private fun InfoBanner(
    tag: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    AppBanner(
        modifier = Modifier.testTag(tag),
        icon = icon,
        title = title,
        body = body,
        actionLabel = actionLabel,
        onAction = onAction,
    )
}

@Composable
private fun SignedOutLanding(
    modifier: Modifier = Modifier,
    isOnline: Boolean,
    onSignIn: () -> Unit,
) {
    Box(
        modifier = modifier.testTag(UiTestTags.librarySignedOutState),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().widthIn(max = 420.dp).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppIconTile(icon = Icons.Outlined.MenuBook, contentDescription = null)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Sign in to load your library",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    AppMutedText(
                        text =
                            if (isOnline) {
                                "Browse books from Drive, download them, and keep your place."
                            } else {
                                "You are offline. Downloaded books will appear here when available."
                            },
                    )
                }
            }

            AppPrimaryButton(
                text = "Sign in",
                enabled = isOnline,
                onClick = onSignIn,
                icon = { Icon(Icons.Outlined.Login, contentDescription = null, modifier = Modifier.size(18.dp)) },
                modifier = Modifier.fillMaxWidth().testTag(UiTestTags.libraryActionSignIn),
            )

            AppMutedText(
                text =
                    if (isOnline) {
                        "Offline reading stays available for downloaded books."
                    } else {
                        "Reconnect to sync books from Drive."
                    },
            )
        }
    }
}

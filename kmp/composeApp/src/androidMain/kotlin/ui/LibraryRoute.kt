package com.progressivereader.kmp.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.material3.SnackbarHostState
import androidx.lifecycle.viewmodel.compose.viewModel
import com.progressivereader.kmp.logging.AppLog
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.ui.viewmodels.LibraryEvent
import com.progressivereader.kmp.ui.viewmodels.LibraryViewModel
import com.progressivereader.kmp.ui.viewmodels.LibraryViewModelFactory

@Composable
fun LibraryRoute(
    settings: AppSettings,
    sessionJwt: String?,
    viewModelFactory: LibraryViewModelFactory,
    onOpenReader: (bookId: String) -> Unit,
    onOpenSettings: () -> Unit,
    onOpenLogin: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val vm: LibraryViewModel = viewModel(factory = viewModelFactory)
    val state by vm.state.collectAsState()

    val isOnline = rememberIsOnline()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(isOnline, sessionJwt, settings.driveFolderId) {
        vm.updateEnvironment(
            isOnline = isOnline,
            sessionJwt = sessionJwt,
            driveFolderIdOverride = settings.driveFolderId,
        )
    }

    LaunchedEffect(Unit) {
        vm.refreshCached()
    }

    LaunchedEffect(isOnline, sessionJwt, settings.driveFolderId, settings.backendBaseUrl) {
        vm.refreshDrive(force = false)
    }

    LaunchedEffect(Unit) {
        vm.events.collect { ev ->
            when (ev) {
                is LibraryEvent.Snackbar -> {
                    AppLog.i("Library", "Snackbar: ${ev.message}")
                    snackbarHostState.showSnackbar(ev.message)
                }
                is LibraryEvent.OpenReader -> onOpenReader(ev.bookId)
            }
        }
    }

    LibraryScreen(
        state = state,
        snackbarHostState = snackbarHostState,
        onOpenReader = onOpenReader,
        onOpenSettings = onOpenSettings,
        onOpenLogin = onOpenLogin,
        onRefreshDrive = { force -> vm.refreshDrive(force) },
        onImportUri = { uriString -> vm.importFromUri(uriString) },
        onDownload = { file, needsUpdate, parentFolderId, parentFolderName ->
            vm.downloadBook(
                file = file,
                needsUpdate = needsUpdate,
                parentFolderId = parentFolderId,
                parentFolderName = parentFolderName,
            )
        },
        onEnsureRemoteCover = { file, cachedEntry -> vm.ensureRemoteCover(file, cachedEntry) },
        onCreateFolder = { name -> vm.createVirtualFolder(name) },
        onRenameFolder = { folderId, name -> vm.renameVirtualFolder(folderId, name) },
        onDeleteFolder = { folderId -> vm.deleteVirtualFolder(folderId) },
        onMoveBookToFolder = { bookId, folderId -> vm.moveBookToFolder(bookId, folderId) },
        onSetCover = { bookId, uriString -> vm.setCustomCover(bookId, uriString) },
        onRemoveCover = { bookId -> vm.removeCustomCover(bookId) },
        bottomBar = bottomBar,
    )
}


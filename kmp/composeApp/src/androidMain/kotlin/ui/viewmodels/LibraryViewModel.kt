package com.progressivereader.kmp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.progressivereader.kmp.logging.AppLog
import com.progressivereader.kmp.domain.library.CachedBook
import com.progressivereader.kmp.domain.library.DriveFile
import com.progressivereader.kmp.domain.library.LibraryIndex
import com.progressivereader.kmp.usecases.library.CreateVirtualFolderUseCase
import com.progressivereader.kmp.usecases.library.DeleteVirtualFolderUseCase
import com.progressivereader.kmp.usecases.library.DownloadBookUseCase
import com.progressivereader.kmp.usecases.library.EnsureRemoteCoverUseCase
import com.progressivereader.kmp.usecases.library.FetchDriveLibraryUseCase
import com.progressivereader.kmp.usecases.library.ImportBookOutcome
import com.progressivereader.kmp.usecases.library.ImportBookUseCase
import com.progressivereader.kmp.usecases.library.LoadMetadataUseCase
import com.progressivereader.kmp.usecases.library.MetadataLoadResult
import com.progressivereader.kmp.usecases.library.MoveBookToVirtualFolderUseCase
import com.progressivereader.kmp.usecases.library.RefreshCachedLibraryUseCase
import com.progressivereader.kmp.usecases.library.RenameVirtualFolderUseCase
import com.progressivereader.kmp.usecases.library.RemoveCustomCoverUseCase
import com.progressivereader.kmp.usecases.library.SetCustomCoverUseCase
import com.progressivereader.kmp.usecases.library.SyncCachedFoldersFromMetadataUseCase
import com.progressivereader.kmp.usecases.library.UpsertMetadataResult
import java.util.UUID
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

data class LibraryUiState(
    val isOnline: Boolean = true,
    val sessionJwt: String? = null,
    val driveFolderIdOverride: String? = null,
    val cachedIndex: LibraryIndex? = null,
    val localCoverPathByBookId: Map<String, String?> = emptyMap(),
    val remoteFiles: List<DriveFile>? = null,
    val inferredRootFolderId: String? = null,
    val driveFetchFailed: Boolean = false,
    val error: String? = null,
    val downloadingId: String? = null,
    val isImporting: Boolean = false,
    val isUpdatingMetadata: Boolean = false,
    val metadataLoadError: String? = null,
    val coverImageIdByBookId: Map<String, String> = emptyMap(),
    val virtualFolderNameById: Map<String, String> = emptyMap(),
    val virtualFolderIdByBookId: Map<String, String?> = emptyMap(),
    // key presence == attempted; value == cached cover absolute path (nullable)
    val remoteCoverPathByBookId: Map<String, String?> = emptyMap(),
    val remoteCoverLoadingByBookId: Map<String, Boolean> = emptyMap(),
)

sealed interface LibraryEvent {
    data class Snackbar(val message: String) : LibraryEvent

    data class OpenReader(val bookId: String) : LibraryEvent
}

class LibraryViewModel(
    private val refreshCachedLibraryUseCase: RefreshCachedLibraryUseCase,
    private val fetchDriveLibraryUseCase: FetchDriveLibraryUseCase,
    private val loadMetadataUseCase: LoadMetadataUseCase,
    private val syncCachedFoldersFromMetadataUseCase: SyncCachedFoldersFromMetadataUseCase,
    private val downloadBookUseCase: DownloadBookUseCase,
    private val importBookUseCase: ImportBookUseCase,
    private val ensureRemoteCoverUseCase: EnsureRemoteCoverUseCase,
    private val moveBookToVirtualFolderUseCase: MoveBookToVirtualFolderUseCase,
    private val createVirtualFolderUseCase: CreateVirtualFolderUseCase,
    private val renameVirtualFolderUseCase: RenameVirtualFolderUseCase,
    private val deleteVirtualFolderUseCase: DeleteVirtualFolderUseCase,
    private val removeCustomCoverUseCase: RemoveCustomCoverUseCase,
    private val setCustomCoverUseCase: SetCustomCoverUseCase,
) : ViewModel() {
    private val _state = MutableStateFlow(LibraryUiState())
    val state: StateFlow<LibraryUiState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<LibraryEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<LibraryEvent> = _events.asSharedFlow()

    private var lastDriveRootFolderIdFetched: String? = null
    private var lastMetadataFileIdLoaded: String? = null

    private val coverFetchSemaphore = Semaphore(permits = 4)

    fun updateEnvironment(
        isOnline: Boolean,
        sessionJwt: String?,
        driveFolderIdOverride: String?,
    ) {
        val normalizedOverride = driveFolderIdOverride?.trim()?.takeIf { it.isNotBlank() }
        val normalizedJwt = sessionJwt?.trim()?.takeIf { it.isNotBlank() }

        val prior = _state.value
        val priorOverride = prior.driveFolderIdOverride?.trim()?.takeIf { it.isNotBlank() }
        val hadSession = !prior.sessionJwt.isNullOrBlank()
        val hasSession = !normalizedJwt.isNullOrBlank()
        val sessionAvailabilityChanged = hadSession != hasSession

        _state.update {
            it.copy(
                isOnline = isOnline,
                sessionJwt = normalizedJwt,
                driveFolderIdOverride = normalizedOverride,
            )
        }

        if (sessionAvailabilityChanged) {
            // Clear Drive-derived state only when Drive availability changes between signed-in and signed-out.
            // Clerk rotates JWTs in the background; that should not blank the synced library.
            lastDriveRootFolderIdFetched = null
            lastMetadataFileIdLoaded = null
            _state.update {
                it.copy(
                    remoteFiles = null,
                    inferredRootFolderId = null,
                    driveFetchFailed = false,
                    metadataLoadError = null,
                    coverImageIdByBookId = emptyMap(),
                    virtualFolderNameById = emptyMap(),
                    virtualFolderIdByBookId = emptyMap(),
                    remoteCoverPathByBookId = emptyMap(),
                    remoteCoverLoadingByBookId = emptyMap(),
                )
            }
        }

        if (priorOverride != null && normalizedOverride == null) {
            // Switching back to "auto-detect app folder" should re-run inference.
            lastDriveRootFolderIdFetched = null
            _state.update { it.copy(inferredRootFolderId = null) }
        }

        if (normalizedOverride != null && normalizedOverride != priorOverride) {
            // New explicit folder override: discard any inferred folder and force next refresh.
            lastDriveRootFolderIdFetched = null
            _state.update { it.copy(inferredRootFolderId = null) }
        }
    }

    fun refreshCached() {
        viewModelScope.launch {
            val res = refreshCachedLibraryUseCase()
            _state.update {
                it.copy(
                    cachedIndex = res.index,
                    localCoverPathByBookId = res.localCoverPathByBookId,
                )
            }
        }
    }

    fun refreshDrive(force: Boolean) {
        viewModelScope.launch {
            val s0 = _state.value

            _state.update { it.copy(error = null, driveFetchFailed = false) }
            if (force) {
                _state.update { it.copy(remoteCoverPathByBookId = emptyMap(), remoteCoverLoadingByBookId = emptyMap()) }
            }

            val canUseDrive = canUseDrive(s0.copy(driveFetchFailed = false))
            if (!canUseDrive) {
                AppLog.i(
                    "Library",
                    "Skipping Drive refresh: online=${s0.isOnline}, hasSession=${!s0.sessionJwt.isNullOrBlank()}",
                )
                _state.update { it.copy(remoteFiles = null) }
                return@launch
            }

            val explicitRootFolderId = s0.driveFolderIdOverride?.takeIf { !it.isNullOrBlank() }
            if (force && explicitRootFolderId == null) {
                lastDriveRootFolderIdFetched = null
                _state.update { it.copy(inferredRootFolderId = null) }
            }

            val effectiveRootFolderId = explicitRootFolderId ?: s0.inferredRootFolderId
            if (!force && effectiveRootFolderId == lastDriveRootFolderIdFetched && s0.remoteFiles != null && !s0.driveFetchFailed) {
                AppLog.i(
                    "Library",
                    "Skipping Drive refresh: cached listing reused for folder=${effectiveRootFolderId ?: "<root>"}",
                )
                return@launch
            }

            AppLog.i(
                "Library",
                "Refreshing Drive library: force=$force, override=${explicitRootFolderId ?: "<none>"}, inferred=${s0.inferredRootFolderId ?: "<none>"}",
            )

            val driveRes =
                runCatching {
                    fetchDriveLibraryUseCase(
                        rootFolderOverrideId = explicitRootFolderId,
                        inferredRootFolderId = _state.value.inferredRootFolderId,
                    )
                }
            if (driveRes.isFailure) {
                val msg = driveRes.exceptionOrNull()?.message ?: "Failed to load Drive library"
                AppLog.e("Library", "Drive refresh failed: $msg", driveRes.exceptionOrNull())
                _state.update {
                    it.copy(
                        error = if (it.remoteFiles.isNullOrEmpty()) msg else null,
                        driveFetchFailed = true,
                    )
                }
                return@launch
            }

            val listing = driveRes.getOrThrow()
            if (!force && listing.files.isEmpty() && !s0.remoteFiles.isNullOrEmpty()) {
                AppLog.w(
                    "Library",
                    "Drive refresh returned an empty listing during auto-refresh; keeping the previous synced library.",
                )
                _state.update { it.copy(error = null, driveFetchFailed = true) }
                return@launch
            }
            AppLog.i(
                "Library",
                "Drive refresh loaded ${listing.files.size} files from folder=${listing.effectiveRootFolderId ?: "<root>"} (inferred=${listing.inferredRootFolderId ?: "<none>"})",
            )
            lastDriveRootFolderIdFetched = listing.effectiveRootFolderId
            _state.update {
                it.copy(
                    inferredRootFolderId = listing.inferredRootFolderId,
                    remoteFiles = listing.files,
                )
            }

            runCatching { refreshMetadataIfPresent(files = listing.files, force = force) }
        }
    }

    fun downloadBook(
        file: DriveFile,
        needsUpdate: Boolean,
        parentFolderId: String?,
        parentFolderName: String?,
    ) {
        viewModelScope.launch {
            _state.update { it.copy(error = null, downloadingId = file.id) }
            try {
                val res =
                    downloadBookUseCase(
                        file = file,
                        needsUpdate = needsUpdate,
                        parentFolderId = parentFolderId,
                        parentFolderName = parentFolderName,
                    )
                if (res == null) {
                    _state.update { it.copy(error = "Download failed.") }
                    _events.tryEmit(LibraryEvent.Snackbar(if (needsUpdate) "Update failed" else "Download failed"))
                    return@launch
                }

                _state.update {
                    it.copy(
                        cachedIndex = res.index,
                        localCoverPathByBookId = it.localCoverPathByBookId + (res.bookId to res.localCoverPath),
                    )
                }
                _events.tryEmit(LibraryEvent.Snackbar(if (needsUpdate) "Updated download" else "Downloaded"))
                _events.tryEmit(LibraryEvent.OpenReader(res.bookId))
            } catch (t: Throwable) {
                _state.update { it.copy(error = t.message ?: "Download failed") }
            } finally {
                _state.update { it.copy(downloadingId = null) }
            }
        }
    }

    fun importFromUri(uriString: String) {
        viewModelScope.launch {
            val s0 = _state.value
            if (s0.isImporting || s0.downloadingId != null) return@launch

            _state.update { it.copy(error = null, isImporting = true) }
            try {
                val canUseDrive = canUseDrive(_state.value)
                val folderIdForUpload = _state.value.driveFolderIdOverride ?: _state.value.inferredRootFolderId
                val localBookId = "local_${UUID.randomUUID()}"

                when (
                    val out =
                        importBookUseCase(
                            uriString = uriString,
                            canUseDrive = canUseDrive,
                            folderIdForUpload = folderIdForUpload,
                            localBookId = localBookId,
                        )
                ) {
                    is ImportBookOutcome.Error -> {
                        _events.tryEmit(LibraryEvent.Snackbar(out.message))
                    }
                    is ImportBookOutcome.Success -> {
                        _state.update {
                            it.copy(
                                cachedIndex = out.index,
                                localCoverPathByBookId = it.localCoverPathByBookId + (out.bookId to out.localCoverPath),
                            )
                        }
                        if (out.uploadedToDrive) {
                            runCatching { refreshDrive(force = true) }
                            _events.tryEmit(LibraryEvent.Snackbar("Uploaded and cached."))
                        } else {
                            _events.tryEmit(LibraryEvent.Snackbar("Imported to device."))
                        }
                        _events.tryEmit(LibraryEvent.OpenReader(out.bookId))
                    }
                }
            } catch (t: Throwable) {
                _state.update { it.copy(error = t.message ?: "Import failed") }
            } finally {
                _state.update { it.copy(isImporting = false) }
            }
        }
    }

    fun ensureRemoteCover(file: DriveFile, cachedEntry: CachedBook?) {
        viewModelScope.launch {
            val s0 = _state.value
            if (!canUseDrive(s0)) return@launch

            val fileId = file.id
            if (s0.remoteCoverPathByBookId.containsKey(fileId)) return@launch
            if (s0.remoteCoverLoadingByBookId[fileId] == true) return@launch

            _state.update { it.copy(remoteCoverLoadingByBookId = it.remoteCoverLoadingByBookId + (fileId to true)) }
            try {
                coverFetchSemaphore.withPermit {
                    val localCoverPath = s0.localCoverPathByBookId[fileId]
                    val coverImageId = s0.coverImageIdByBookId[fileId]
                    val coverPath =
                        ensureRemoteCoverUseCase(
                            file = file,
                            localCoverPath = localCoverPath,
                            coverImageFileId = coverImageId,
                        )
                    _state.update {
                        it.copy(remoteCoverPathByBookId = it.remoteCoverPathByBookId + (fileId to coverPath))
                    }
                }
            } finally {
                _state.update { it.copy(remoteCoverLoadingByBookId = it.remoteCoverLoadingByBookId + (fileId to false)) }
            }
        }
    }

    fun createVirtualFolder(name: String) {
        viewModelScope.launch {
            if (!canUseDrive(_state.value)) {
                _events.tryEmit(LibraryEvent.Snackbar("Sign in and go online to update folders/covers."))
                return@launch
            }
            if (_state.value.isUpdatingMetadata) return@launch

            val normalized = normalizeFolderName(name)
            if (normalized == null) {
                _events.tryEmit(LibraryEvent.Snackbar("Folder name required."))
                return@launch
            }

            val folderId = generateVirtualFolderId()
            _state.update { it.copy(isUpdatingMetadata = true) }
            try {
                val res = createVirtualFolderUseCase(folderId = folderId, folderName = normalized)
                if (res == null) {
                    _events.tryEmit(LibraryEvent.Snackbar("Failed to update metadata.json."))
                    return@launch
                }
                applyMetadataUpdate(res, snackbarMessage = "Folder created.")
            } finally {
                _state.update { it.copy(isUpdatingMetadata = false) }
            }
        }
    }

    fun renameVirtualFolder(folderId: String, name: String) {
        viewModelScope.launch {
            if (!canUseDrive(_state.value)) {
                _events.tryEmit(LibraryEvent.Snackbar("Sign in and go online to update folders/covers."))
                return@launch
            }
            if (_state.value.isUpdatingMetadata) return@launch

            val normalized = normalizeFolderName(name)
            if (normalized == null) {
                _events.tryEmit(LibraryEvent.Snackbar("Folder name required."))
                return@launch
            }

            _state.update { it.copy(isUpdatingMetadata = true) }
            try {
                val res = renameVirtualFolderUseCase(folderId = folderId, folderName = normalized)
                if (res == null) {
                    _events.tryEmit(LibraryEvent.Snackbar("Failed to update metadata.json."))
                    return@launch
                }
                applyMetadataUpdate(res, snackbarMessage = "Folder renamed.")
            } finally {
                _state.update { it.copy(isUpdatingMetadata = false) }
            }
        }
    }

    fun deleteVirtualFolder(folderId: String) {
        viewModelScope.launch {
            if (!canUseDrive(_state.value)) {
                _events.tryEmit(LibraryEvent.Snackbar("Sign in and go online to update folders/covers."))
                return@launch
            }
            if (_state.value.isUpdatingMetadata) return@launch

            _state.update { it.copy(isUpdatingMetadata = true) }
            try {
                val res = deleteVirtualFolderUseCase(folderId = folderId)
                if (res == null) {
                    _events.tryEmit(LibraryEvent.Snackbar("Failed to update metadata.json."))
                    return@launch
                }
                applyMetadataUpdate(res, snackbarMessage = "Folder deleted.")
            } finally {
                _state.update { it.copy(isUpdatingMetadata = false) }
            }
        }
    }

    fun moveBookToFolder(bookId: String, folderId: String?) {
        viewModelScope.launch {
            if (!canUseDrive(_state.value)) {
                _events.tryEmit(LibraryEvent.Snackbar("Sign in and go online to update folders/covers."))
                return@launch
            }
            if (_state.value.isUpdatingMetadata) return@launch

            _state.update { it.copy(isUpdatingMetadata = true) }
            try {
                val res = moveBookToVirtualFolderUseCase(bookId = bookId, folderId = folderId)
                if (res == null) {
                    _events.tryEmit(LibraryEvent.Snackbar("Failed to update metadata.json."))
                    return@launch
                }
                applyMetadataUpdate(res, snackbarMessage = "Moved.")
            } finally {
                _state.update { it.copy(isUpdatingMetadata = false) }
            }
        }
    }

    fun removeCustomCover(bookId: String) {
        viewModelScope.launch {
            if (!canUseDrive(_state.value)) {
                _events.tryEmit(LibraryEvent.Snackbar("Sign in to set covers."))
                return@launch
            }
            if (_state.value.isUpdatingMetadata) return@launch

            val existing = _state.value.coverImageIdByBookId[bookId]?.trim()?.takeIf { it.isNotBlank() } ?: return@launch

            _state.update { it.copy(isUpdatingMetadata = true) }
            try {
                val res = removeCustomCoverUseCase(bookId = bookId, existingCoverFileId = existing)
                if (res == null) {
                    _events.tryEmit(LibraryEvent.Snackbar("Failed to update metadata.json."))
                    return@launch
                }
                applyMetadataUpdate(res.metadata, snackbarMessage = "Cover removed.")
                _state.update {
                    it.copy(
                        remoteCoverPathByBookId = it.remoteCoverPathByBookId - bookId,
                        remoteCoverLoadingByBookId = it.remoteCoverLoadingByBookId - bookId,
                    )
                }
            } finally {
                _state.update { it.copy(isUpdatingMetadata = false) }
            }
        }
    }

    fun setCustomCover(bookId: String, imageUriString: String) {
        viewModelScope.launch {
            if (!canUseDrive(_state.value)) {
                _events.tryEmit(LibraryEvent.Snackbar("Sign in to set covers."))
                return@launch
            }
            if (_state.value.isUpdatingMetadata) return@launch

            val folderIdForUpload = _state.value.driveFolderIdOverride ?: _state.value.inferredRootFolderId
            val oldCoverId = _state.value.coverImageIdByBookId[bookId]

            _state.update { it.copy(isUpdatingMetadata = true) }
            try {
                val res =
                    setCustomCoverUseCase(
                        bookId = bookId,
                        imageUriString = imageUriString,
                        folderIdForUpload = folderIdForUpload,
                        oldCoverFileId = oldCoverId,
                    )
                if (res == null) {
                    _events.tryEmit(LibraryEvent.Snackbar("Cover upload failed."))
                    return@launch
                }
                applyMetadataUpdate(res.metadata, snackbarMessage = "Cover updated.")
                _state.update {
                    it.copy(
                        remoteCoverPathByBookId = it.remoteCoverPathByBookId - bookId,
                        remoteCoverLoadingByBookId = it.remoteCoverLoadingByBookId - bookId,
                    )
                }
            } finally {
                _state.update { it.copy(isUpdatingMetadata = false) }
            }
        }
    }

    private suspend fun refreshMetadataIfPresent(files: List<DriveFile>, force: Boolean) {
        val s0 = _state.value
        if (!canUseDrive(s0)) return

        val res: MetadataLoadResult =
            loadMetadataUseCase(
                files = files,
                force = force,
                lastMetadataFileIdLoaded = lastMetadataFileIdLoaded,
            )

        if (!res.error.isNullOrBlank()) {
            _state.update { it.copy(metadataLoadError = res.error) }
            return
        }

        if (!res.didUpdate) return

        lastMetadataFileIdLoaded = res.fileId
        _state.update {
            it.copy(
                metadataLoadError = null,
                coverImageIdByBookId = res.metadata.coverImageIdByBookId,
                virtualFolderNameById = res.metadata.virtualFolderNameById,
                virtualFolderIdByBookId = res.metadata.virtualFolderIdByBookId,
            )
        }

        val sync =
            syncCachedFoldersFromMetadataUseCase(
                folderNameById = res.metadata.virtualFolderNameById,
                folderIdByBookId = res.metadata.virtualFolderIdByBookId,
                existingIndex = _state.value.cachedIndex,
            )
        if (sync.changed) {
            _state.update { it.copy(cachedIndex = sync.index) }
        }
    }

    private suspend fun applyMetadataUpdate(updated: UpsertMetadataResult, snackbarMessage: String?) {
        lastMetadataFileIdLoaded = updated.fileId
        _state.update {
            it.copy(
                metadataLoadError = null,
                coverImageIdByBookId = updated.metadata.coverImageIdByBookId,
                virtualFolderNameById = updated.metadata.virtualFolderNameById,
                virtualFolderIdByBookId = updated.metadata.virtualFolderIdByBookId,
            )
        }

        val sync =
            syncCachedFoldersFromMetadataUseCase(
                folderNameById = updated.metadata.virtualFolderNameById,
                folderIdByBookId = updated.metadata.virtualFolderIdByBookId,
                existingIndex = _state.value.cachedIndex,
            )
        if (sync.changed) {
            _state.update { it.copy(cachedIndex = sync.index) }
        }

        if (!snackbarMessage.isNullOrBlank()) {
            _events.tryEmit(LibraryEvent.Snackbar(snackbarMessage))
        }
    }

    private fun canUseDrive(s: LibraryUiState): Boolean =
        s.isOnline && !s.sessionJwt.isNullOrBlank()

    private fun generateVirtualFolderId(): String {
        val ts = System.currentTimeMillis()
        val suffix = UUID.randomUUID().toString().replace("-", "").take(8)
        return "folder_${ts}_$suffix"
    }

    private fun normalizeFolderName(raw: String): String? =
        raw.trim().replace(Regex("\\s+"), " ").takeIf { it.isNotBlank() }
}

class LibraryViewModelFactory(
    private val refreshCachedLibrary: RefreshCachedLibraryUseCase,
    private val fetchDriveLibrary: FetchDriveLibraryUseCase,
    private val loadMetadata: LoadMetadataUseCase,
    private val syncCachedFoldersFromMetadata: SyncCachedFoldersFromMetadataUseCase,
    private val downloadBook: DownloadBookUseCase,
    private val importBook: ImportBookUseCase,
    private val ensureRemoteCover: EnsureRemoteCoverUseCase,
    private val moveBookToVirtualFolder: MoveBookToVirtualFolderUseCase,
    private val createVirtualFolder: CreateVirtualFolderUseCase,
    private val renameVirtualFolder: RenameVirtualFolderUseCase,
    private val deleteVirtualFolder: DeleteVirtualFolderUseCase,
    private val removeCustomCover: RemoveCustomCoverUseCase,
    private val setCustomCover: SetCustomCoverUseCase,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(LibraryViewModel::class.java)) {
            return LibraryViewModel(
                refreshCachedLibraryUseCase = refreshCachedLibrary,
                fetchDriveLibraryUseCase = fetchDriveLibrary,
                loadMetadataUseCase = loadMetadata,
                syncCachedFoldersFromMetadataUseCase = syncCachedFoldersFromMetadata,
                downloadBookUseCase = downloadBook,
                importBookUseCase = importBook,
                ensureRemoteCoverUseCase = ensureRemoteCover,
                moveBookToVirtualFolderUseCase = moveBookToVirtualFolder,
                createVirtualFolderUseCase = createVirtualFolder,
                renameVirtualFolderUseCase = renameVirtualFolder,
                deleteVirtualFolderUseCase = deleteVirtualFolder,
                removeCustomCoverUseCase = removeCustomCover,
                setCustomCoverUseCase = setCustomCover,
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

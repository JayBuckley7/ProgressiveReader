package com.progressivereader.kmp.ui

import com.progressivereader.kmp.domain.library.CachedBook
import com.progressivereader.kmp.domain.library.DriveFile
import com.progressivereader.kmp.domain.library.LibraryIndex
import com.progressivereader.kmp.domain.library.isPdf
import com.progressivereader.kmp.domain.library.isSupportedBook
import com.progressivereader.kmp.domain.library.isTxt
import com.progressivereader.kmp.ui.viewmodels.LibraryUiState
import java.util.Locale

internal data class LibraryShelfPresentation(
    val key: String,
    val title: String,
    val countLabel: String,
    val books: List<LibraryBookPresentation>,
    val isFolderShelf: Boolean = false,
)

internal data class LibraryBookPresentation(
    val file: DriveFile,
    val cachedEntry: CachedBook?,
    val displayTitle: String,
    val detailLine: String,
    val coverPath: String?,
    val hasCustomCover: Boolean,
    val isCached: Boolean,
    val needsUpdate: Boolean,
    val isBusy: Boolean,
    val remoteCoverAttempted: Boolean,
    val typeLabel: String,
    val parentFolderId: String? = null,
    val parentFolderName: String? = null,
)

internal fun presentDriveShelves(state: LibraryUiState): List<LibraryShelfPresentation> {
    val files = state.remoteFiles.orEmpty()
    val cachedById = state.cachedIndex?.books?.associateBy { it.id }.orEmpty()
    val allBooks = files.filter { it.isSupportedBook() }
    val allBookIds = allBooks.map { it.id }.toSet()
    val visibleFolders =
        state.virtualFolderNameById
            .filterValues { name -> !name.trim().equals("JLPT", ignoreCase = true) }

    val uncategorizedBooks =
        allBooks.filter { file ->
            val folderId = state.virtualFolderIdByBookId[file.id]
            folderId.isNullOrBlank() || folderId !in visibleFolders.keys
        }

    val shelves = mutableListOf<LibraryShelfPresentation>()
    shelves +=
        LibraryShelfPresentation(
            key = "my-books",
            title = "My Books",
            countLabel = countLabel(uncategorizedBooks.size),
            books =
                uncategorizedBooks.map { file ->
                    presentBook(
                        file = file,
                        cachedEntry = cachedById[file.id],
                        localCoverPath = state.localCoverPathByBookId[file.id],
                        remoteCoverPath = state.remoteCoverPathByBookId[file.id],
                        remoteCoverAttempted = state.remoteCoverPathByBookId.containsKey(file.id),
                        hasCustomCover = !state.coverImageIdByBookId[file.id].isNullOrBlank(),
                        isBusy = state.downloadingId == file.id,
                    )
                },
        )

    visibleFolders
        .entries
        .sortedBy { it.value.lowercase() }
        .forEach { (folderId, name) ->
            val folderBooks = allBooks.filter { file -> state.virtualFolderIdByBookId[file.id] == folderId }
            shelves +=
                LibraryShelfPresentation(
                    key = "folder-$folderId",
                    title = name,
                    countLabel = countLabel(folderBooks.size),
                    books =
                        folderBooks.map { file ->
                            presentBook(
                                file = file,
                                cachedEntry = cachedById[file.id],
                                localCoverPath = state.localCoverPathByBookId[file.id],
                                remoteCoverPath = state.remoteCoverPathByBookId[file.id],
                                remoteCoverAttempted = state.remoteCoverPathByBookId.containsKey(file.id),
                                hasCustomCover = !state.coverImageIdByBookId[file.id].isNullOrBlank(),
                                isBusy = state.downloadingId == file.id,
                                parentFolderId = folderId,
                                parentFolderName = name,
                            )
                        },
                    isFolderShelf = true,
                )
        }

    val localOnly =
        state.cachedIndex
            ?.books
            ?.filter { it.id !in allBookIds }
            ?.sortedBy { it.name.lowercase() }
            .orEmpty()
    if (localOnly.isNotEmpty()) {
        shelves +=
            LibraryShelfPresentation(
                key = "local-only",
                title = "On this device",
                countLabel = countLabel(localOnly.size),
                books =
                    localOnly.map { cached ->
                        presentBook(
                            file =
                                DriveFile(
                                    id = cached.id,
                                    name = cached.name,
                                    mimeType = cached.mimeType,
                                    size = cached.size,
                                    modifiedTime = cached.modifiedTime,
                                ),
                            cachedEntry = cached,
                            localCoverPath = state.localCoverPathByBookId[cached.id],
                            remoteCoverPath = null,
                            remoteCoverAttempted = true,
                            hasCustomCover = false,
                            isBusy = false,
                        )
                    },
            )
    }
    return shelves
}

internal fun presentCachedShelves(
    cachedIndex: LibraryIndex?,
    localCoverPathByBookId: Map<String, String?>,
): List<LibraryShelfPresentation> {
    if (cachedIndex == null) return emptyList()
    if (cachedIndex.books.isEmpty()) return emptyList()

    val grouped = cachedIndex.books.groupBy { it.parentFolderName ?: "My Books" }
    val orderedKeys = listOf("My Books") + grouped.keys.filter { it != "My Books" }.sorted()
    return orderedKeys.map { key ->
        val books = grouped[key].orEmpty().sortedBy { it.name.lowercase() }
        LibraryShelfPresentation(
            key = "cached-${key.lowercase()}",
            title = key,
            countLabel = countLabel(books.size),
            books =
                books.map { cached ->
                    presentBook(
                        file =
                            DriveFile(
                                id = cached.id,
                                name = cached.name,
                                mimeType = cached.mimeType,
                                size = cached.size,
                                modifiedTime = cached.modifiedTime,
                            ),
                        cachedEntry = cached,
                        localCoverPath = localCoverPathByBookId[cached.id],
                        remoteCoverPath = null,
                        remoteCoverAttempted = true,
                        hasCustomCover = false,
                        isBusy = false,
                    )
                },
            isFolderShelf = key != "My Books",
        )
    }
}

internal fun cleanLibraryDisplayTitle(rawName: String): String {
    val stem =
        rawName
            .trim()
            .let { name ->
                val dotIndex = name.lastIndexOf('.')
                if (dotIndex > 0) name.substring(0, dotIndex) else name
            }
            .replace(Regex(""" \(\d+\)$"""), "")
            .replace(Regex("""[_-]+"""), " ")
            .replace(Regex("""\s+"""), " ")
            .trim()

    return stem.ifBlank { rawName.trim().ifBlank { "Untitled" } }
}

internal fun formatBytes(bytes: Long): String {
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

private fun presentBook(
    file: DriveFile,
    cachedEntry: CachedBook?,
    localCoverPath: String?,
    remoteCoverPath: String?,
    remoteCoverAttempted: Boolean,
    hasCustomCover: Boolean,
    isBusy: Boolean,
    parentFolderId: String? = null,
    parentFolderName: String? = null,
): LibraryBookPresentation {
    val isCached = cachedEntry != null
    val needsUpdate =
        isCached &&
            !file.modifiedTime.isNullOrBlank() &&
            file.modifiedTime != cachedEntry?.modifiedTime
    val typeLabel =
        when {
            file.isPdf() -> "PDF"
            file.isTxt() -> "TXT"
            else -> "EPUB"
        }
    val coverPath =
        if (hasCustomCover) {
            remoteCoverPath ?: localCoverPath
        } else {
            localCoverPath ?: remoteCoverPath
        }

    val statusLabel =
        when {
            isBusy -> "Downloading"
            needsUpdate -> "Update ready"
            isCached -> "Cached"
            else -> null
        }

    val detailParts = buildList {
        statusLabel?.let { add(it) }
        add(typeLabel)
        file.size?.let { add(formatBytes(it)) }
    }

    return LibraryBookPresentation(
        file = file,
        cachedEntry = cachedEntry,
        displayTitle = cleanLibraryDisplayTitle(file.name),
        detailLine = detailParts.joinToString(" \u2022 "),
        coverPath = coverPath,
        hasCustomCover = hasCustomCover,
        isCached = isCached,
        needsUpdate = needsUpdate,
        isBusy = isBusy,
        remoteCoverAttempted = remoteCoverAttempted,
        typeLabel = typeLabel,
        parentFolderId = parentFolderId,
        parentFolderName = parentFolderName,
    )
}

private fun countLabel(count: Int): String = if (count == 1) "1 book" else "$count books"

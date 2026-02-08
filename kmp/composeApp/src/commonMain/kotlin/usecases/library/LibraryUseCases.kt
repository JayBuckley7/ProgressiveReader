package com.progressivereader.kmp.usecases.library

import com.progressivereader.kmp.domain.library.CachedBook
import com.progressivereader.kmp.domain.library.DriveFile
import com.progressivereader.kmp.domain.library.LibraryIndex
import com.progressivereader.kmp.domain.library.guessMimeTypeFromName
import com.progressivereader.kmp.domain.library.isEpub
import com.progressivereader.kmp.domain.library.isFolder
import com.progressivereader.kmp.domain.library.isPdf
import com.progressivereader.kmp.domain.library.isSupportedImport
import com.progressivereader.kmp.domain.library.isSupportedBook
import com.progressivereader.kmp.domain.library.isTxt
import com.progressivereader.kmp.ports.CoverCachePort
import com.progressivereader.kmp.ports.DocumentPort
import com.progressivereader.kmp.ports.DrivePort
import com.progressivereader.kmp.ports.LibraryPort
import com.progressivereader.kmp.ports.ThumbnailDownloadResult
import com.progressivereader.kmp.ports.TimePort
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class DriveLibraryResult(
    val effectiveRootFolderId: String?,
    val inferredRootFolderId: String?,
    val files: List<DriveFile>,
)

class FetchDriveLibraryUseCase(
    private val drivePort: DrivePort,
) {
    suspend operator fun invoke(
        rootFolderOverrideId: String?,
        inferredRootFolderId: String?,
    ): DriveLibraryResult {
        val explicit = rootFolderOverrideId?.trim()?.takeIf { it.isNotBlank() }
        if (explicit != null) {
            val list = drivePort.listFiles(folderId = explicit).sortedBy { it.name.lowercase() }
            return DriveLibraryResult(
                effectiveRootFolderId = explicit,
                inferredRootFolderId = inferredRootFolderId,
                files = list,
            )
        }

        val inferred = inferredRootFolderId?.trim()?.takeIf { it.isNotBlank() }
        if (inferred != null) {
            val list = drivePort.listFiles(folderId = inferred).sortedBy { it.name.lowercase() }
            return DriveLibraryResult(
                effectiveRootFolderId = inferred,
                inferredRootFolderId = inferred,
                files = list,
            )
        }

        val rootFiles = drivePort.listFiles(folderId = null)
        val appFolder =
            rootFiles.firstOrNull { it.isFolder() && it.name.equals("ProgReader", ignoreCase = true) }
                ?: rootFiles.firstOrNull { it.isFolder() && it.name.equals("ProgressiveReader", ignoreCase = true) }

        if (appFolder != null) {
            val list = drivePort.listFiles(folderId = appFolder.id).sortedBy { it.name.lowercase() }
            return DriveLibraryResult(
                effectiveRootFolderId = appFolder.id,
                inferredRootFolderId = appFolder.id,
                files = list,
            )
        }

        return DriveLibraryResult(
            effectiveRootFolderId = null,
            inferredRootFolderId = null,
            files = rootFiles.sortedBy { it.name.lowercase() },
        )
    }
}

data class LibraryMetadata(
    val coverImageIdByBookId: Map<String, String> = emptyMap(),
    val virtualFolderNameById: Map<String, String> = emptyMap(),
    val virtualFolderIdByBookId: Map<String, String?> = emptyMap(),
)

data class MetadataLoadResult(
    val fileId: String?,
    val metadata: LibraryMetadata,
    val error: String? = null,
    val didUpdate: Boolean = false,
)

class LoadMetadataUseCase(
    private val drivePort: DrivePort,
) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
        }

    suspend operator fun invoke(
        files: List<DriveFile>,
        force: Boolean,
        lastMetadataFileIdLoaded: String?,
    ): MetadataLoadResult {
        val metadataFile =
            files.firstOrNull { it.name.equals("metadata.json", ignoreCase = true) }
                ?: return MetadataLoadResult(fileId = lastMetadataFileIdLoaded, metadata = LibraryMetadata())

        if (!force && metadataFile.id == lastMetadataFileIdLoaded) {
            return MetadataLoadResult(
                fileId = lastMetadataFileIdLoaded,
                metadata = LibraryMetadata(),
                didUpdate = false,
            )
        }

        val bytes = runCatching { drivePort.download(metadataFile.id) }.getOrNull()
        if (bytes == null || bytes.isEmpty()) {
            return MetadataLoadResult(
                fileId = lastMetadataFileIdLoaded,
                metadata = LibraryMetadata(),
                error = "Failed to load metadata.json",
                didUpdate = false,
            )
        }

        val text = runCatching { bytes.toString(Charsets.UTF_8) }.getOrNull()
        if (text.isNullOrBlank()) {
            return MetadataLoadResult(
                fileId = lastMetadataFileIdLoaded,
                metadata = LibraryMetadata(),
                error = "Invalid metadata.json",
                didUpdate = false,
            )
        }

        val root =
            runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
                ?: return MetadataLoadResult(
                    fileId = lastMetadataFileIdLoaded,
                    metadata = LibraryMetadata(),
                    error = "Invalid metadata.json",
                    didUpdate = false,
                )

        val covers = parseCoverMapFromMetadataRoot(root)
        val folders = parseVirtualFoldersFromMetadataRoot(root)
        val assignments = parseBookFolderAssignmentsFromMetadataRoot(root)

        return MetadataLoadResult(
            fileId = metadataFile.id,
            metadata =
                LibraryMetadata(
                    coverImageIdByBookId = covers,
                    virtualFolderNameById = folders,
                    virtualFolderIdByBookId = assignments,
                ),
            error = null,
            didUpdate = true,
        )
    }
}

data class UpsertMetadataResult(
    val fileId: String,
    val metadata: LibraryMetadata,
)

class UpsertMetadataJsonUseCase(
    private val drivePort: DrivePort,
) {
    suspend operator fun invoke(
        mutate: (JsonObject) -> JsonObject,
    ): UpsertMetadataResult? {
        val updated =
            drivePort.upsertJson(
                fileName = "metadata.json",
                defaultJson = defaultMetadataRoot(),
                mutate = mutate,
            ) ?: return null

        val root = updated.json
        return UpsertMetadataResult(
            fileId = updated.fileId,
            metadata =
                LibraryMetadata(
                    coverImageIdByBookId = parseCoverMapFromMetadataRoot(root),
                    virtualFolderNameById = parseVirtualFoldersFromMetadataRoot(root),
                    virtualFolderIdByBookId = parseBookFolderAssignmentsFromMetadataRoot(root),
                ),
        )
    }
}

class MoveBookToVirtualFolderUseCase(
    private val upsertMetadataJson: UpsertMetadataJsonUseCase,
) {
    suspend operator fun invoke(
        bookId: String,
        folderId: String?,
    ): UpsertMetadataResult? {
        val normalized = folderId?.trim()?.takeIf { it.isNotBlank() }
        return upsertMetadataJson { base ->
            val booksObj = base["books"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
            val currentObj = booksObj[bookId]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())

            val nextMap = currentObj.toMutableMap()
            if (normalized == null) nextMap.remove("folderId") else nextMap["folderId"] = JsonPrimitive(normalized)

            val nextBooks = JsonObject(booksObj.toMutableMap().apply { put(bookId, JsonObject(nextMap)) })
            JsonObject(base.toMutableMap().apply { put("books", nextBooks) })
        }
    }
}

class CreateVirtualFolderUseCase(
    private val upsertMetadataJson: UpsertMetadataJsonUseCase,
    private val timePort: TimePort,
) {
    suspend operator fun invoke(
        folderId: String,
        folderName: String,
    ): UpsertMetadataResult? {
        val normalized = normalizeFolderName(folderName) ?: return null
        val now = timePort.nowIsoUtc()
        return upsertMetadataJson { base ->
            val foldersObj = base["folders"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
            val folderObj =
                JsonObject(
                    mapOf(
                        "name" to JsonPrimitive(normalized),
                        "createdAt" to JsonPrimitive(now),
                        "updatedAt" to JsonPrimitive(now),
                    ),
                )
            val nextFolders = JsonObject(foldersObj.toMutableMap().apply { put(folderId, folderObj) })
            JsonObject(base.toMutableMap().apply { put("folders", nextFolders) })
        }
    }
}

class RenameVirtualFolderUseCase(
    private val upsertMetadataJson: UpsertMetadataJsonUseCase,
    private val timePort: TimePort,
) {
    suspend operator fun invoke(
        folderId: String,
        folderName: String,
    ): UpsertMetadataResult? {
        val normalized = normalizeFolderName(folderName) ?: return null
        val now = timePort.nowIsoUtc()
        return upsertMetadataJson { base ->
            val foldersObj = base["folders"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
            val current = foldersObj[folderId]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
            val nextObj =
                JsonObject(
                    current.toMutableMap().apply {
                        put("name", JsonPrimitive(normalized))
                        put("updatedAt", JsonPrimitive(now))
                    },
                )
            val nextFolders = JsonObject(foldersObj.toMutableMap().apply { put(folderId, nextObj) })
            JsonObject(base.toMutableMap().apply { put("folders", nextFolders) })
        }
    }
}

class DeleteVirtualFolderUseCase(
    private val upsertMetadataJson: UpsertMetadataJsonUseCase,
) {
    suspend operator fun invoke(
        folderId: String,
    ): UpsertMetadataResult? =
        upsertMetadataJson { base ->
            val foldersObj = base["folders"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
            val nextFolders = JsonObject(foldersObj.toMutableMap().apply { remove(folderId) })

            val booksObj = base["books"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
            val nextBooksMap = booksObj.toMutableMap()
            for ((bookId, value) in booksObj) {
                val obj = runCatching { value.jsonObject }.getOrNull() ?: continue
                val assigned = obj["folderId"]?.let { runCatching { it.jsonPrimitive.content }.getOrNull() }?.trim()
                if (assigned == folderId) {
                    val next = JsonObject(obj.toMutableMap().apply { remove("folderId") })
                    nextBooksMap[bookId] = next
                }
            }
            val nextBooks = JsonObject(nextBooksMap)

            JsonObject(
                base.toMutableMap().apply {
                    put("folders", nextFolders)
                    put("books", nextBooks)
                },
            )
        }
}

data class RemoveCustomCoverResult(
    val metadata: UpsertMetadataResult,
)

class RemoveCustomCoverUseCase(
    private val drivePort: DrivePort,
    private val coverCachePort: CoverCachePort,
    private val upsertMetadataJson: UpsertMetadataJsonUseCase,
) {
    suspend operator fun invoke(
        bookId: String,
        existingCoverFileId: String,
    ): RemoveCustomCoverResult? {
        val updated =
            upsertMetadataJson { base ->
                val coversObj = base["covers"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
                if (!coversObj.containsKey(bookId)) return@upsertMetadataJson base
                val nextCovers = JsonObject(coversObj.toMutableMap().apply { remove(bookId) })
                JsonObject(base.toMutableMap().apply { put("covers", nextCovers) })
            } ?: return null

        runCatching { drivePort.deleteFile(existingCoverFileId) }
        runCatching { coverCachePort.deleteCover(bookId) }

        return RemoveCustomCoverResult(metadata = updated)
    }
}

data class SetCustomCoverResult(
    val metadata: UpsertMetadataResult,
    val newCoverFileId: String,
)

class SetCustomCoverUseCase(
    private val drivePort: DrivePort,
    private val documentPort: DocumentPort,
    private val coverCachePort: CoverCachePort,
    private val upsertMetadataJson: UpsertMetadataJsonUseCase,
) {
    suspend operator fun invoke(
        bookId: String,
        imageUriString: String,
        folderIdForUpload: String?,
        oldCoverFileId: String?,
    ): SetCustomCoverResult? {
        val doc = documentPort.read(imageUriString) ?: return null
        if (doc.bytes.isEmpty()) return null

        val mime = doc.mimeType?.trim()?.takeIf { it.isNotBlank() } ?: "image/jpeg"
        val ext =
            when {
                mime.contains("png", ignoreCase = true) -> "png"
                mime.contains("webp", ignoreCase = true) -> "webp"
                else -> "jpg"
            }
        val filename = "cover_${bookId}_${kotlin.random.Random.nextInt(1_000_000)}.$ext"

        val uploaded =
            drivePort.upload(
                filename = filename,
                bytes = doc.bytes,
                mimeType = mime,
                folderId = folderIdForUpload,
            )
        val newCoverId = uploaded?.id?.trim().orEmpty()
        if (newCoverId.isBlank()) return null

        val updated =
            upsertMetadataJson { base ->
                val coversObj = base["covers"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
                val nextCovers = JsonObject(coversObj.toMutableMap().apply { put(bookId, JsonPrimitive(newCoverId)) })
                JsonObject(base.toMutableMap().apply { put("covers", nextCovers) })
            } ?: return null

        // Best-effort cleanup.
        if (!oldCoverFileId.isNullOrBlank() && oldCoverFileId != newCoverId) {
            runCatching { drivePort.deleteFile(oldCoverFileId) }
        }
        runCatching { coverCachePort.deleteCover(bookId) }

        return SetCustomCoverResult(
            metadata = updated,
            newCoverFileId = newCoverId,
        )
    }
}

data class SyncCachedFoldersResult(
    val index: LibraryIndex,
    val changed: Boolean,
)

class SyncCachedFoldersFromMetadataUseCase(
    private val libraryPort: LibraryPort,
    private val timePort: TimePort,
) {
    suspend operator fun invoke(
        folderNameById: Map<String, String>,
        folderIdByBookId: Map<String, String?>,
        existingIndex: LibraryIndex?,
    ): SyncCachedFoldersResult {
        val existing = existingIndex ?: libraryPort.loadIndex()
        var changed = false
        val updatedBooks =
            existing.books.map { entry ->
                val folderId = folderIdByBookId[entry.id]
                val name = folderId?.let { folderNameById[it] }
                val nextFolderId = if (name == null) null else folderId
                if (entry.parentFolderId != nextFolderId || entry.parentFolderName != name) {
                    changed = true
                    entry.copy(parentFolderId = nextFolderId, parentFolderName = name)
                } else {
                    entry
                }
            }
        if (!changed) return SyncCachedFoldersResult(index = existing, changed = false)

        val now = timePort.nowIsoUtc()
        val updated = existing.copy(updatedAt = now, books = updatedBooks)
        libraryPort.saveIndex(updated)
        return SyncCachedFoldersResult(index = updated, changed = true)
    }
}

data class RefreshCachedLibraryResult(
    val index: LibraryIndex,
    val localCoverPathByBookId: Map<String, String?>,
)

class RefreshCachedLibraryUseCase(
    private val libraryPort: LibraryPort,
) {
    suspend operator fun invoke(): RefreshCachedLibraryResult {
        val loaded = libraryPort.loadIndex()
        val refreshed = libraryPort.refreshIndexCovers(loaded)
        if (refreshed.changed) {
            libraryPort.saveIndex(refreshed.index)
        }
        val coverPaths =
            refreshed.index.books.associate { b ->
                b.id to runCatching { libraryPort.resolveCoverPath(bookId = b.id, coverFileName = b.coverPath) }.getOrNull()
            }
        return RefreshCachedLibraryResult(
            index = refreshed.index,
            localCoverPathByBookId = coverPaths,
        )
    }
}

data class DownloadBookResult(
    val index: LibraryIndex,
    val bookId: String,
    val localCoverPath: String?,
)

class DownloadBookUseCase(
    private val drivePort: DrivePort,
    private val libraryPort: LibraryPort,
    private val timePort: TimePort,
) {
    suspend operator fun invoke(
        file: DriveFile,
        needsUpdate: Boolean,
        parentFolderId: String?,
        parentFolderName: String?,
    ): DownloadBookResult? {
        val dest = libraryPort.contentPath(file.id, file.mimeType, file.name)
        val ok = drivePort.downloadTo(fileId = file.id, destPath = dest)
        if (!ok) return null

        if (needsUpdate) {
            runCatching { libraryPort.clearExtracted(file.id) }
        }

        val coverFileName =
            runCatching { libraryPort.extractCoverIfNeeded(bookId = file.id, filename = file.name, mimeType = file.mimeType) }
                .getOrNull()

        val now = timePort.nowIsoUtc()
        val existing = libraryPort.loadIndex()
        val prior = existing.books.firstOrNull { it.id == file.id }
        val entry =
            CachedBook(
                id = file.id,
                name = file.name,
                mimeType = file.mimeType,
                size = file.size,
                modifiedTime = file.modifiedTime,
                parentFolderId = parentFolderId,
                parentFolderName = parentFolderName,
                coverPath = coverFileName,
                cachedAt = now,
                lastOpenedAt = prior?.lastOpenedAt,
            )
        val updated =
            existing.copy(
                updatedAt = now,
                books = existing.books.filterNot { it.id == file.id } + entry,
            )
        libraryPort.saveIndex(updated)
        val localCoverPath =
            runCatching { libraryPort.resolveCoverPath(bookId = file.id, coverFileName = entry.coverPath) }.getOrNull()
        return DownloadBookResult(index = updated, bookId = file.id, localCoverPath = localCoverPath)
    }
}

sealed interface ImportBookOutcome {
    data class Success(
        val index: LibraryIndex,
        val bookId: String,
        val uploadedToDrive: Boolean,
        val localCoverPath: String?,
    ) : ImportBookOutcome

    data class Error(
        val message: String,
    ) : ImportBookOutcome
}

class ImportBookUseCase(
    private val documentPort: DocumentPort,
    private val drivePort: DrivePort,
    private val libraryPort: LibraryPort,
    private val timePort: TimePort,
) {
    suspend operator fun invoke(
        uriString: String,
        canUseDrive: Boolean,
        folderIdForUpload: String?,
        localBookId: String,
    ): ImportBookOutcome {
        val doc = documentPort.read(uriString) ?: return ImportBookOutcome.Error("Failed to read file.")

        val displayName = doc.displayName.trim().ifBlank { "book.epub" }
        val resolvedMime = doc.mimeType?.trim()?.takeIf { it.isNotBlank() }
        val guessed = guessMimeTypeFromName(displayName)
        val mimeType =
            if (resolvedMime.isNullOrBlank() || resolvedMime.equals("application/octet-stream", ignoreCase = true)) {
                guessed
            } else {
                resolvedMime
            }

        if (!isSupportedImport(displayName, mimeType)) {
            return ImportBookOutcome.Error("Unsupported file. Use EPUB, PDF, or TXT.")
        }

        if (doc.bytes.isEmpty()) return ImportBookOutcome.Error("Failed to read file.")

        val uploadedId: String?
        val remoteModifiedTime: String?
        if (canUseDrive) {
            val uploaded =
                runCatching {
                    drivePort.upload(
                        filename = displayName,
                        bytes = doc.bytes,
                        mimeType = mimeType,
                        folderId = folderIdForUpload,
                    )
                }.getOrNull()
            uploadedId = uploaded?.id
            remoteModifiedTime = uploaded?.modifiedTime
        } else {
            uploadedId = null
            remoteModifiedTime = null
        }

        val bookId = uploadedId ?: localBookId

        runCatching {
            libraryPort.writeContent(
                bookId = bookId,
                filename = displayName,
                mimeType = mimeType,
                bytes = doc.bytes,
            )
        }.onFailure { return ImportBookOutcome.Error(it.message ?: "Import failed") }

        val coverFileName =
            runCatching { libraryPort.extractCoverIfNeeded(bookId = bookId, filename = displayName, mimeType = mimeType) }
                .getOrNull()

        val now = timePort.nowIsoUtc()
        val existing = libraryPort.loadIndex()
        val prior = existing.books.firstOrNull { it.id == bookId }
        val entry =
            CachedBook(
                id = bookId,
                name = displayName,
                mimeType = mimeType,
                size = doc.bytes.size.toLong(),
                modifiedTime = remoteModifiedTime,
                parentFolderId = null,
                parentFolderName = null,
                coverPath = coverFileName ?: prior?.coverPath,
                cachedAt = now,
                lastOpenedAt = prior?.lastOpenedAt,
            )
        val updated =
            existing.copy(
                updatedAt = now,
                books = existing.books.filterNot { it.id == bookId } + entry,
            )
        libraryPort.saveIndex(updated)

        val localCoverPath =
            runCatching { libraryPort.resolveCoverPath(bookId = bookId, coverFileName = entry.coverPath) }.getOrNull()

        return ImportBookOutcome.Success(
            index = updated,
            bookId = bookId,
            uploadedToDrive = uploadedId != null,
            localCoverPath = localCoverPath,
        )
    }
}

class EnsureRemoteCoverUseCase(
    private val drivePort: DrivePort,
    private val coverCachePort: CoverCachePort,
) {
    suspend operator fun invoke(
        file: DriveFile,
        localCoverPath: String?,
        coverImageFileId: String?,
    ): String? {
        val fileId = file.id
        val coverImageId = coverImageFileId?.trim()?.takeIf { it.isNotBlank() }

        // Covers are supported for EPUB/TXT (Drive often lacks thumbnails) and for any book with
        // an explicit metadata.json cover mapping.
        if (coverImageId == null && !file.isEpub() && !file.isTxt()) return null
        if (coverImageId == null && localCoverPath != null) return null

        val cached = coverCachePort.existingCoverPath(fileId)
        if (cached != null) return cached

        val destPath = coverCachePort.coverPath(fileId)
        if (coverImageId != null) {
            val thumb =
                drivePort.downloadThumbnailTo(
                    fileId = coverImageId,
                    destPath = destPath,
                    size = 600,
                )
            if (thumb == ThumbnailDownloadResult.Success) return destPath

            val ok = drivePort.downloadTo(fileId = coverImageId, destPath = destPath)
            return if (ok) destPath else null
        }

        if (file.hasThumbnail == false && file.thumbnailLink.isNullOrBlank()) return null

        return when (
            drivePort.downloadThumbnailTo(
                fileId = fileId,
                destPath = destPath,
                size = 420,
            )
        ) {
            ThumbnailDownloadResult.Success -> destPath
            ThumbnailDownloadResult.NotFound -> null
            ThumbnailDownloadResult.Failed -> null
        }
    }
}

private fun normalizeFolderName(raw: String): String? =
    raw.trim().replace(Regex("\\s+"), " ").takeIf { it.isNotBlank() }

private fun defaultMetadataRoot(): JsonObject =
    JsonObject(
        mapOf(
            "version" to JsonPrimitive(1),
            "covers" to JsonObject(emptyMap()),
            "folders" to JsonObject(emptyMap()),
            "books" to JsonObject(emptyMap()),
        ),
    )

private fun parseCoverMapFromMetadataRoot(root: JsonObject): Map<String, String> {
    val covers = root["covers"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: return emptyMap()
    return covers.mapNotNull { (bookId, value) ->
        val coverId = runCatching { value.jsonPrimitive.content }.getOrNull()
        if (coverId.isNullOrBlank()) null else bookId to coverId
    }.toMap()
}

private fun parseVirtualFoldersFromMetadataRoot(root: JsonObject): Map<String, String> {
    val folders = root["folders"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: return emptyMap()
    return folders.mapNotNull { (folderId, value) ->
        val obj = runCatching { value.jsonObject }.getOrNull() ?: return@mapNotNull null
        val name = runCatching { obj["name"]?.jsonPrimitive?.content }.getOrNull()
        if (name.isNullOrBlank()) null else folderId to name
    }.toMap()
}

private fun parseBookFolderAssignmentsFromMetadataRoot(root: JsonObject): Map<String, String?> {
    val books = root["books"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: return emptyMap()
    return books.map { (bookId, value) ->
        val obj = runCatching { value.jsonObject }.getOrNull()
        val folderId =
            runCatching { obj?.get("folderId")?.jsonPrimitive?.content }.getOrNull()
                ?.trim()
                ?.takeIf { it.isNotBlank() && !it.equals("null", ignoreCase = true) }
        bookId to folderId
    }.toMap()
}

package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.domain.library.CachedBook
import com.progressivereader.kmp.domain.library.LibraryIndex
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.BooksIndex
import com.progressivereader.kmp.offline.CachedBookEntry
import com.progressivereader.kmp.offline.extractPdfCoverIfNeeded
import com.progressivereader.kmp.ports.LibraryPort
import com.progressivereader.kmp.ports.RefreshCoversResult
import com.progressivereader.kmp.reader.EpubRepository
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidLibraryPort(
    private val bookCache: BookCache,
    private val epubRepository: EpubRepository,
    private val timePort: AndroidTimePort = AndroidTimePort(),
) : LibraryPort {
    override suspend fun loadIndex(): LibraryIndex = bookCache.loadIndex().toDomain()

    override suspend fun saveIndex(index: LibraryIndex) {
        bookCache.saveIndex(index.toOffline())
    }

    override fun contentPath(bookId: String, mimeType: String?, filename: String): String =
        bookCache.contentFile(bookId = bookId, mimeType = mimeType, filename = filename).absolutePath

    override suspend fun writeContent(
        bookId: String,
        filename: String,
        mimeType: String?,
        bytes: ByteArray,
    ) {
        val destFile = bookCache.contentFile(bookId = bookId, mimeType = mimeType, filename = filename)
        withContext(Dispatchers.IO) {
            destFile.parentFile?.mkdirs()
            destFile.writeBytes(bytes)
        }
    }

    override suspend fun clearExtracted(bookId: String) {
        withContext(Dispatchers.IO) {
            bookCache.extractedDir(bookId).deleteRecursively()
        }
    }

    override suspend fun extractCoverIfNeeded(bookId: String, filename: String, mimeType: String?): String? {
        val lower = filename.lowercase()
        val mt = (mimeType ?: "").lowercase()

        val coverFile =
            if (lower.endsWith(".epub") || mt.contains("epub")) {
                runCatching {
                    val extractedDir = bookCache.extractedDir(bookId)
                    epubRepository.extractIfNeeded(
                        epubFile = bookCache.epubFile(bookId),
                        extractedDir = extractedDir,
                    )
                    // Prepare navigation metadata and sanitized reader sections while the cover
                    // still shows its compact loading state. Opening the book can then stay on
                    // the fast path instead of parsing and splitting the EPUB in the reader.
                    runCatching { epubRepository.loadBook(extractedDir) }
                    epubRepository.extractCoverIfNeeded(
                        extractedDir = extractedDir,
                        bookDir = bookCache.bookDir(bookId),
                    )
                }.getOrNull()
            } else if (lower.endsWith(".pdf") || mt.contains("pdf")) {
                runCatching { extractPdfCoverIfNeeded(bookCache, bookId) }.getOrNull()
            } else {
                null
            }

        return coverFile?.takeIf { it.exists() && it.isFile && it.length() > 0 }?.name
    }

    override suspend fun resolveCoverPath(bookId: String, coverFileName: String?): String? =
        withContext(Dispatchers.IO) {
            val name = coverFileName?.trim()?.takeIf { it.isNotBlank() }
            if (name != null) {
                val direct = File(bookCache.bookDir(bookId), name)
                if (direct.exists() && direct.isFile && direct.length() > 0) return@withContext direct.absolutePath
            }

            val found = bookCache.findCoverFile(bookId)
            found?.takeIf { it.exists() && it.isFile && it.length() > 0 }?.absolutePath
        }

    override suspend fun refreshIndexCovers(index: LibraryIndex): RefreshCoversResult {
        var changed = false
        val updatedBooks =
            index.books.map { entry ->
                val existingCoverFileName = existingCoverFileNameFor(entry)
                if (existingCoverFileName != null) {
                    if (entry.coverPath.isNullOrBlank() || entry.coverPath != existingCoverFileName) {
                        changed = true
                        entry.copy(coverPath = existingCoverFileName)
                    } else {
                        entry
                    }
                } else {
                    val isPdf =
                        entry.name.endsWith(".pdf", ignoreCase = true) ||
                            (entry.mimeType?.contains("pdf", ignoreCase = true) == true)
                    if (isPdf) {
                        val cover = runCatching { extractPdfCoverIfNeeded(bookCache, entry.id) }.getOrNull()
                        if (cover != null && cover.exists() && cover.isFile && cover.length() > 0) {
                            changed = true
                            entry.copy(coverPath = cover.name)
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
                        if (cover != null && cover.exists() && cover.isFile && cover.length() > 0) {
                            changed = true
                            entry.copy(coverPath = cover.name)
                        } else {
                            entry
                        }
                    }
                }
            }

        if (!changed) return RefreshCoversResult(index = index, changed = false)
        val now = timePort.nowIsoUtc()
        return RefreshCoversResult(
            index = index.copy(updatedAt = now, books = updatedBooks),
            changed = true,
        )
    }

    private fun existingCoverFileNameFor(entry: CachedBook): String? {
        val path = entry.coverPath?.trim()?.takeIf { it.isNotBlank() }
        if (path != null) {
            val direct = File(bookCache.bookDir(entry.id), path)
            if (direct.exists() && direct.isFile && direct.length() > 0) return direct.name
        }
        return bookCache.findCoverFile(entry.id)?.takeIf { it.exists() && it.isFile && it.length() > 0 }?.name
    }

    private fun BooksIndex.toDomain(): LibraryIndex =
        LibraryIndex(
            updatedAt = updatedAt,
            books =
                books.map {
                    CachedBook(
                        id = it.id,
                        name = it.name,
                        mimeType = it.mimeType,
                        size = it.size,
                        modifiedTime = it.modifiedTime,
                        parentFolderId = it.parentFolderId,
                        parentFolderName = it.parentFolderName,
                        coverPath = it.coverPath,
                        cachedAt = it.cachedAt,
                        lastOpenedAt = it.lastOpenedAt,
                    )
                },
        )

    private fun LibraryIndex.toOffline(): BooksIndex =
        BooksIndex(
            updatedAt = updatedAt,
            books =
                books.map {
                    CachedBookEntry(
                        id = it.id,
                        name = it.name,
                        mimeType = it.mimeType,
                        size = it.size,
                        modifiedTime = it.modifiedTime,
                        parentFolderId = it.parentFolderId,
                        parentFolderName = it.parentFolderName,
                        coverPath = it.coverPath,
                        cachedAt = it.cachedAt,
                        lastOpenedAt = it.lastOpenedAt,
                    )
                },
        )
}


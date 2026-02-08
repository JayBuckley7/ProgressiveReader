package com.progressivereader.kmp.ports

import com.progressivereader.kmp.domain.library.LibraryIndex

data class RefreshCoversResult(
    val index: LibraryIndex,
    val changed: Boolean,
)

interface LibraryPort {
    suspend fun loadIndex(): LibraryIndex

    suspend fun saveIndex(index: LibraryIndex)

    fun contentPath(
        bookId: String,
        mimeType: String?,
        filename: String,
    ): String

    suspend fun writeContent(
        bookId: String,
        filename: String,
        mimeType: String?,
        bytes: ByteArray,
    )

    suspend fun clearExtracted(bookId: String)

    suspend fun extractCoverIfNeeded(
        bookId: String,
        filename: String,
        mimeType: String?,
    ): String?

    suspend fun resolveCoverPath(
        bookId: String,
        coverFileName: String?,
    ): String?

    suspend fun refreshIndexCovers(index: LibraryIndex): RefreshCoversResult
}


package com.progressivereader.kmp.domain.library

import kotlinx.serialization.Serializable

@Serializable
data class LibraryIndex(
    val updatedAt: String,
    val books: List<CachedBook>,
)

@Serializable
data class CachedBook(
    val id: String,
    val name: String,
    val mimeType: String? = null,
    val size: Long? = null,
    val modifiedTime: String? = null,
    val parentFolderId: String? = null,
    val parentFolderName: String? = null,
    /**
     * File name relative to the book directory (e.g. `cover.jpg`).
     * Absolute paths must not be persisted.
     */
    val coverPath: String? = null,
    val cachedAt: String,
    val lastOpenedAt: String? = null,
)

@Serializable
data class DriveFile(
    val id: String,
    val name: String,
    val mimeType: String? = null,
    val size: Long? = null,
    val modifiedTime: String? = null,
    val thumbnailLink: String? = null,
    val hasThumbnail: Boolean? = null,
)

fun DriveFile.isFolder(): Boolean =
    mimeType?.equals("application/vnd.google-apps.folder", ignoreCase = true) == true

fun DriveFile.isEpub(): Boolean {
    if (name.endsWith(".epub", ignoreCase = true)) return true
    val mt = mimeType ?: return false
    return mt.equals("application/epub+zip", ignoreCase = true) || mt.contains("epub", ignoreCase = true)
}

fun DriveFile.isPdf(): Boolean {
    if (name.endsWith(".pdf", ignoreCase = true)) return true
    val mt = mimeType ?: return false
    return mt.equals("application/pdf", ignoreCase = true) || mt.contains("pdf", ignoreCase = true)
}

fun DriveFile.isTxt(): Boolean {
    if (name.endsWith(".txt", ignoreCase = true)) return true
    val mt = mimeType ?: return false
    return mt.equals("text/plain", ignoreCase = true) || mt.startsWith("text/", ignoreCase = true)
}

fun DriveFile.isSupportedBook(): Boolean = isEpub() || isPdf() || isTxt()

fun guessMimeTypeFromName(name: String): String {
    val lower = name.lowercase()
    return when {
        lower.endsWith(".pdf") -> "application/pdf"
        lower.endsWith(".txt") -> "text/plain"
        lower.endsWith(".epub") -> "application/epub+zip"
        else -> "application/octet-stream"
    }
}

fun isSupportedImport(displayName: String, mimeType: String?): Boolean {
    val lower = displayName.lowercase()
    val mt = (mimeType ?: "").lowercase()
    if (lower.endsWith(".epub") || mt.contains("epub")) return true
    if (lower.endsWith(".pdf") || mt.contains("pdf")) return true
    if (lower.endsWith(".txt") || mt.startsWith("text/")) return true
    return false
}


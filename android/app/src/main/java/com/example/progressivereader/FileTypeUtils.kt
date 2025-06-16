package com.example.progressivereader

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap

/**
 * Utility functions for detecting file types from URIs returned by
 * ActivityResultContracts.OpenDocument() and similar APIs.
 */
object FileTypeUtils {
    /**
     * Determine the MIME type for the given [uri]. When the URI uses the
     * `content` scheme, this relies on [ContentResolver.getType]. For file
     * paths, the extension is used.
     */
    fun Context.getMimeType(uri: Uri): String? {
        return if (uri.scheme == ContentResolver.SCHEME_CONTENT) {
            contentResolver.getType(uri)
        } else {
            val extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString())
            if (extension.isNullOrEmpty()) null else
                MimeTypeMap.getSingleton()
                    .getMimeTypeFromExtension(extension.lowercase())
        }
    }

    /**
     * Check if the given [uri] represents a PDF document.
     */
    fun Context.isPdf(uri: Uri): Boolean {
        return getMimeType(uri) == "application/pdf"
    }

    /**
     * Check if the given [uri] represents an EPUB book.
     */
    fun Context.isEpub(uri: Uri): Boolean {
        return getMimeType(uri) == "application/epub+zip"
    }
}

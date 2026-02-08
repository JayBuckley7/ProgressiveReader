package com.progressivereader.kmp.adapters

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.progressivereader.kmp.ports.DocumentPort
import com.progressivereader.kmp.ports.ReadDocumentResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidDocumentPort(
    context: Context,
) : DocumentPort {
    private val appContext = context.applicationContext

    override suspend fun read(uriString: String): ReadDocumentResult? {
        val uri = runCatching { Uri.parse(uriString) }.getOrNull() ?: return null
        val resolver = appContext.contentResolver

        val displayName =
            withContext(Dispatchers.IO) {
                val cursor =
                    runCatching {
                        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                    }.getOrNull()
                cursor?.use { c ->
                    if (c.moveToFirst()) {
                        val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (idx >= 0) {
                            val name = runCatching { c.getString(idx) }.getOrNull()
                            if (!name.isNullOrBlank()) return@withContext name
                        }
                    }
                }
                uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() }
            } ?: "file"

        val mimeType = runCatching { resolver.getType(uri) }.getOrNull()
        val bytes =
            withContext(Dispatchers.IO) {
                resolver.openInputStream(uri)?.use { it.readBytes() }
            } ?: return null

        return ReadDocumentResult(
            displayName = displayName,
            mimeType = mimeType,
            bytes = bytes,
        )
    }
}


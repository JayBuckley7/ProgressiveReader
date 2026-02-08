package com.progressivereader.kmp.ports

data class ReadDocumentResult(
    val displayName: String,
    val mimeType: String?,
    val bytes: ByteArray,
)

interface DocumentPort {
    suspend fun read(uriString: String): ReadDocumentResult?
}


package com.progressivereader.kmp.ports

import com.progressivereader.kmp.domain.library.DriveFile
import kotlinx.serialization.json.JsonObject

enum class ThumbnailDownloadResult {
    Success,
    NotFound,
    Failed,
}

data class UpsertedJsonFile(
    val fileId: String,
    val json: JsonObject,
)

interface DrivePort {
    suspend fun listFiles(folderId: String?): List<DriveFile>

    suspend fun download(fileId: String): ByteArray?

    suspend fun upload(
        filename: String,
        bytes: ByteArray,
        mimeType: String,
        folderId: String?,
    ): DriveFile?

    suspend fun deleteFile(fileId: String): Boolean

    suspend fun downloadTo(fileId: String, destPath: String): Boolean

    suspend fun downloadThumbnailTo(
        fileId: String,
        destPath: String,
        size: Int = 420,
    ): ThumbnailDownloadResult

    suspend fun upsertJson(
        fileName: String,
        defaultJson: JsonObject,
        mutate: (JsonObject) -> JsonObject,
    ): UpsertedJsonFile?
}


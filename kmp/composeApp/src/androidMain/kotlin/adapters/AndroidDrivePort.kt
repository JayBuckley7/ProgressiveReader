package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.drive.DriveJsonFileService
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.domain.library.DriveFile
import com.progressivereader.kmp.ports.DrivePort
import com.progressivereader.kmp.ports.ThumbnailDownloadResult
import com.progressivereader.kmp.ports.UpsertedJsonFile
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.url
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.isSuccess
import io.ktor.utils.io.readAvailable
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject

class AndroidDrivePort(
    private val http: HttpClient,
    private val getSessionJwt: suspend () -> String?,
    private val driveService: DriveService,
    private val driveJsonFileService: DriveJsonFileService,
) : DrivePort {
    override suspend fun listFiles(folderId: String?): List<DriveFile> =
        driveService.listFiles(folderId = folderId).map { it.toDomain() }

    override suspend fun download(fileId: String): ByteArray? = driveService.download(fileId = fileId)

    override suspend fun upload(
        filename: String,
        bytes: ByteArray,
        mimeType: String,
        folderId: String?,
    ): DriveFile? {
        val res =
            driveService.upload(
                filename = filename,
                bytes = bytes,
                mimeType = mimeType,
                folderId = folderId,
            ) ?: return null

        return DriveFile(
            id = res.id,
            name = res.name ?: filename,
            mimeType = res.mimeType,
            size = res.size,
            modifiedTime = res.modifiedTime,
            thumbnailLink = null,
            hasThumbnail = null,
        )
    }

    override suspend fun deleteFile(fileId: String): Boolean = driveService.deleteFile(fileId = fileId)

    override suspend fun downloadTo(fileId: String, destPath: String): Boolean {
        val jwt = getSessionJwt()?.trim()?.takeIf { it.isNotBlank() } ?: return false
        val res =
            http.get("${Config.baseUrl}/drive/download/$fileId") {
                headers.append("Authorization", "Bearer $jwt")
            }
        if (!res.status.isSuccess()) return false

        val dest = File(destPath)
        dest.parentFile?.mkdirs()
        val channel = res.bodyAsChannel()
        return withContext(Dispatchers.IO) {
            dest.outputStream().use { os ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val read = channel.readAvailable(buffer, 0, buffer.size)
                    if (read == -1) break
                    os.write(buffer, 0, read)
                }
            }
            dest.exists() && dest.isFile && dest.length() > 0
        }
    }

    override suspend fun downloadThumbnailTo(
        fileId: String,
        destPath: String,
        size: Int,
    ): ThumbnailDownloadResult {
        val jwt = getSessionJwt()?.trim()?.takeIf { it.isNotBlank() } ?: return ThumbnailDownloadResult.Failed
        val res =
            http.get("${Config.baseUrl}/drive/thumbnail/$fileId") {
                headers.append("Authorization", "Bearer $jwt")
                url { parameters.append("size", size.toString()) }
            }

        if (res.status.value == 404) return ThumbnailDownloadResult.NotFound
        if (!res.status.isSuccess()) return ThumbnailDownloadResult.Failed

        val dest = File(destPath)
        dest.parentFile?.mkdirs()
        val channel = res.bodyAsChannel()
        return withContext(Dispatchers.IO) {
            dest.outputStream().use { os ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val read = channel.readAvailable(buffer, 0, buffer.size)
                    if (read == -1) break
                    os.write(buffer, 0, read)
                }
            }
            if (dest.exists() && dest.isFile && dest.length() > 0) ThumbnailDownloadResult.Success else ThumbnailDownloadResult.Failed
        }
    }

    override suspend fun upsertJson(
        fileName: String,
        defaultJson: JsonObject,
        mutate: (JsonObject) -> JsonObject,
    ): UpsertedJsonFile? {
        val updated =
            driveJsonFileService.upsertJson(
                fileName = fileName,
                defaultJson = defaultJson,
                mutate = mutate,
            ) ?: return null
        return UpsertedJsonFile(fileId = updated.fileId, json = updated.json)
    }

    private fun DriveService.DriveFile.toDomain(): DriveFile =
        DriveFile(
            id = id,
            name = name,
            mimeType = mimeType,
            size = size,
            modifiedTime = modifiedTime,
            thumbnailLink = thumbnailLink,
            hasThumbnail = hasThumbnail,
        )
}


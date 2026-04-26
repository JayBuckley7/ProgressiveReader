package com.progressivereader.kmp.drive

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import com.progressivereader.kmp.core.FlexibleLongSerializer
import kotlinx.serialization.Serializable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import io.ktor.client.request.forms.*
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.utils.io.core.readBytes
import io.ktor.utils.io.readRemaining

class DriveService(private val getSessionToken: suspend () -> String?) {
    private val http = createHttpClient()
    private var cachedAppFolder: DriveFile? = null
    private var cachedAppFolderSessionToken: String? = null

    @Serializable
    data class DriveFile(
        val id: String,
        val name: String,
        val mimeType: String? = null,
        @Serializable(with = FlexibleLongSerializer::class)
        val size: Long? = null,
        val modifiedTime: String? = null,
        val iconLink: String? = null,
        val webViewLink: String? = null,
        val thumbnailLink: String? = null,
        val hasThumbnail: Boolean? = null,
    )

    @Serializable
    data class UploadResponse(
        val id: String,
        val name: String? = null,
        val mimeType: String? = null,
        @Serializable(with = FlexibleLongSerializer::class)
        val size: Long? = null,
        val modifiedTime: String? = null,
    )

    suspend fun listFiles(folderId: String?): List<DriveFile> {
        val token = currentSessionToken() ?: return emptyList()
        val targetFolderId =
            when {
                folderId.isNullOrBlank() -> ensureAppFolderId()
                else -> folderId
            } ?: return emptyList()
        val res = http.get("${Config.baseUrl}/drive/files") {
            headers.append("Authorization", "Bearer $token")
            parameter("folderId", targetFolderId)
        }
        if (!res.status.isSuccess()) return emptyList()
        return res.body()
    }

    suspend fun ensureAppFolder(): DriveFile? {
        val sessionToken = currentSessionToken() ?: return null
        if (cachedAppFolderSessionToken != sessionToken) {
            cachedAppFolder = null
            cachedAppFolderSessionToken = sessionToken
        }
        cachedAppFolder?.let { return it }

        val accessToken = requestGoogleAccessToken()?.access_token?.trim()?.takeIf { it.isNotBlank() } ?: return null
        val folder = findExistingAppFolder(accessToken) ?: createAppFolder(accessToken)
        if (folder != null) {
            cachedAppFolder = folder
            cachedAppFolderSessionToken = sessionToken
        }
        return folder
    }

    suspend fun ensureAppFolderId(): String? = ensureAppFolder()?.id

    suspend fun requestGoogleAccessToken(): GoogleTokenResponse? {
        val token = currentSessionToken() ?: return null
        val res = http.post("${Config.baseUrl}/drive/token") {
            headers.append("Authorization", "Bearer $token")
        }
        if (!res.status.isSuccess()) return null
        return res.body()
    }

    @Serializable
    data class GoogleTokenResponse(val access_token: String, val expires_in: Long)

    suspend fun deleteFile(fileId: String): Boolean {
        val token = currentSessionToken() ?: return false
        val res = http.delete("${Config.baseUrl}/drive/files/$fileId") {
            headers.append("Authorization", "Bearer $token")
        }
        return res.status.isSuccess()
    }

    suspend fun download(fileId: String): ByteArray? {
        val token = currentSessionToken() ?: return null
        val res = http.get("${Config.baseUrl}/drive/download/$fileId") {
            headers.append("Authorization", "Bearer $token")
        }
        if (!res.status.isSuccess()) return null
        val channel = res.bodyAsChannel()
        return withContext(Dispatchers.IO) { channel.readRemaining().readBytes() }
    }

    suspend fun upload(
        filename: String,
        bytes: ByteArray,
        mimeType: String = "application/epub+zip",
        folderId: String? = null,
    ): UploadResponse? {
        val token = currentSessionToken() ?: return null
        val targetFolderId =
            when {
                folderId.isNullOrBlank() -> ensureAppFolderId()
                else -> folderId
            }

        // Backend expects `file` and optionally `folderId` in multipart form fields.
        val form =
            formData {
                if (!targetFolderId.isNullOrBlank()) append("folderId", targetFolderId)
                append(
                    "file",
                    bytes,
                    Headers.build {
                        append(HttpHeaders.ContentType, mimeType)
                        append(HttpHeaders.ContentDisposition, "form-data; name=\"file\"; filename=\"$filename\"")
                    },
                )
            }
        val res = http.post("${Config.baseUrl}/drive/upload") {
            headers.append("Authorization", "Bearer $token")
            setBody(MultiPartFormDataContent(form))
        }
        if (!res.status.isSuccess()) return null
        return runCatching { res.body<UploadResponse>() }.getOrNull()
    }

    @Serializable
    private data class GoogleDriveFilesResponse(
        val files: List<DriveFile> = emptyList(),
    )

    @Serializable
    private data class CreateDriveFolderRequest(
        val name: String,
        val mimeType: String,
    )

    private suspend fun currentSessionToken(): String? = getSessionToken()?.trim()?.takeIf { it.isNotBlank() }

    private suspend fun findExistingAppFolder(accessToken: String): DriveFile? {
        val res =
            http.get("https://www.googleapis.com/drive/v3/files") {
                headers.append(HttpHeaders.Authorization, "Bearer $accessToken")
                parameter(
                    "q",
                    "mimeType='$APP_FOLDER_MIME_TYPE' and (name='ProgReader' or name='ProgressiveReader') and trashed=false",
                )
                parameter(
                    "fields",
                    "files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,thumbnailLink,hasThumbnail)",
                )
                parameter("pageSize", 10)
                parameter("spaces", "drive")
            }
        if (!res.status.isSuccess()) return null

        return runCatching { res.body<GoogleDriveFilesResponse>() }.getOrNull()
            ?.files
            ?.sortedWith(compareByDescending<DriveFile> { it.name.equals(PREFERRED_APP_FOLDER_NAME, ignoreCase = true) }.thenBy { it.name.lowercase() })
            ?.firstOrNull()
    }

    private suspend fun createAppFolder(accessToken: String): DriveFile? {
        val res =
            http.post("https://www.googleapis.com/drive/v3/files") {
                headers.append(HttpHeaders.Authorization, "Bearer $accessToken")
                contentType(ContentType.Application.Json)
                parameter("fields", "id,name,mimeType,modifiedTime,size,webViewLink,iconLink,thumbnailLink,hasThumbnail")
                setBody(
                    CreateDriveFolderRequest(
                        name = PREFERRED_APP_FOLDER_NAME,
                        mimeType = APP_FOLDER_MIME_TYPE,
                    ),
                )
            }
        if (!res.status.isSuccess()) return null
        return runCatching { res.body<DriveFile>() }.getOrNull()
    }

    private companion object {
        const val APP_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder"
        const val PREFERRED_APP_FOLDER_NAME = "ProgReader"
    }
}

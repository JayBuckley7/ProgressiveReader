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

class DriveService(private val getSessionToken: () -> String?) {
    private val http = createHttpClient()

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

    suspend fun listFiles(folderId: String?): List<DriveFile> {
        val token = getSessionToken() ?: return emptyList()
        val res = http.get("${Config.baseUrl}/drive/files") {
            headers.append("Authorization", "Bearer $token")
            if (!folderId.isNullOrBlank()) parameter("folderId", folderId)
        }
        if (!res.status.isSuccess()) return emptyList()
        return res.body()
    }

    suspend fun requestGoogleAccessToken(): GoogleTokenResponse? {
        val token = getSessionToken() ?: return null
        val res = http.post("${Config.baseUrl}/drive/token") {
            headers.append("Authorization", "Bearer $token")
        }
        if (!res.status.isSuccess()) return null
        return res.body()
    }

    @Serializable
    data class GoogleTokenResponse(val access_token: String, val expires_in: Long)

    suspend fun deleteFile(fileId: String): Boolean {
        val token = getSessionToken() ?: return false
        val res = http.delete("${Config.baseUrl}/drive/files/$fileId") {
            headers.append("Authorization", "Bearer $token")
        }
        return res.status.isSuccess()
    }

    suspend fun download(fileId: String): ByteArray? {
        val token = getSessionToken() ?: return null
        val res = http.get("${Config.baseUrl}/drive/download/$fileId") {
            headers.append("Authorization", "Bearer $token")
        }
        if (!res.status.isSuccess()) return null
        val channel = res.bodyAsChannel()
        return withContext(Dispatchers.IO) { channel.readRemaining().readBytes() }
    }

    suspend fun upload(filename: String, bytes: ByteArray, mimeType: String = "application/epub+zip", folderId: String? = null): Boolean {
        val token = getSessionToken() ?: return false
        val form = formData {
            append("metadata", "{" + (folderId?.let { "\"parents\":[\"$it\"]," } ?: "") + "\"name\":\"$filename\"}", Headers.build {
                append(HttpHeaders.ContentType, "application/json; charset=UTF-8")
                append(HttpHeaders.ContentDisposition, "form-data; name=\"metadata\"")
            })
            append("file", bytes, Headers.build {
                append(HttpHeaders.ContentType, mimeType)
                append(HttpHeaders.ContentDisposition, "form-data; name=\"file\"; filename=\"$filename\"")
            })
        }
        val res = http.post("${Config.baseUrl}/drive/upload") {
            headers.append("Authorization", "Bearer $token")
            setBody(MultiPartFormDataContent(form))
        }
        return res.status.isSuccess()
    }
}

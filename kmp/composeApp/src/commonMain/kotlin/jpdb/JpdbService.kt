package com.progressivereader.kmp.jpdb

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

class JpdbService {
    private val http = createHttpClient()

    @Serializable
    data class GetJpdbDataRequest(
        @SerialName("text_segments")
        val textSegments: List<String>,
        @SerialName("jpdb_api_key")
        val jpdbApiKey: String,
    )

    @Serializable
    data class Ruby(
        val text: String,
        val start: Int,
        val length: Int,
        val end: Int,
    )

    @Serializable
    data class ProcessedToken(
        val start: Int,
        val length: Int,
        val end: Int,
        val card: JsonObject,
        val rubies: List<Ruby> = emptyList(),
    )

    suspend fun getJpdbData(textSegments: List<String>, jpdbApiKey: String): List<ProcessedToken>? {
        if (textSegments.isEmpty()) return emptyList()
        if (jpdbApiKey.isBlank()) return null

        val res =
            http.post("${Config.baseUrl}/api/get_jpdb_data") {
                contentType(ContentType.Application.Json)
                setBody(GetJpdbDataRequest(textSegments = textSegments, jpdbApiKey = jpdbApiKey))
            }
        if (!res.status.isSuccess()) return null
        return res.body()
    }
}


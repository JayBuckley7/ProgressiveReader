package com.progressivereader.kmp.jpdb

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable

class JpdbService(private val getSessionToken: () -> String?) {
    private val http = createHttpClient()

    @Serializable
    data class TokenRequest(val text_segments: List<String>, val jpdb_api_key: String)

    @Serializable
    data class ProcessedToken(
        val start: Int,
        val length: Int,
        val end: Int,
        val card: Map<String, @Serializable(with = kotlinx.serialization.json.JsonElementSerializer::class) Any?>? = null,
        val rubies: List<Map<String, Int>>? = null,
    )

    suspend fun analyze(textSegments: List<String>, jpdbApiKey: String): List<ProcessedToken> {
        val token = getSessionToken() ?: return emptyList()
        val res = http.post("${Config.baseUrl}/api/get_jpdb_data") {
            headers.append("Authorization", "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(TokenRequest(textSegments, jpdbApiKey))
        }
        if (!res.status.isSuccess()) return emptyList()
        return res.body()
    }
}



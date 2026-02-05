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

class JpdbActionsService(private val getSessionToken: () -> String?) {
    private val http = createHttpClient()

    @Serializable
    data class MineWordRequest(
        val vid: Int,
        val sid: Int,
        @SerialName("jpdb_api_key")
        val jpdbApiKey: String,
        @SerialName("mining_deck_id")
        val miningDeckId: Int? = null,
    )

    @Serializable
    data class MineWordResponse(val success: Boolean)

    @Serializable
    data class UpdateWordStateRequest(
        val vid: Int,
        val sid: Int,
        val flag: String,
        val state: Boolean,
        @SerialName("jpdb_api_key")
        val jpdbApiKey: String,
    )

    @Serializable
    data class UpdateWordStateResponse(
        val success: Boolean,
        val newState: List<String>? = null,
    )

    @Serializable
    data class ReviewCardRequest(
        val vid: Int,
        val sid: Int,
        val rating: String,
        @SerialName("jpdb_api_key")
        val jpdbApiKey: String,
    )

    @Serializable
    data class ReviewCardResponse(
        val success: Boolean,
        val newState: List<String>? = null,
    )

    suspend fun mineWord(req: MineWordRequest): MineWordResponse? {
        val res =
            http.post("${Config.baseUrl}/api/mine_jpdb_word") {
                getSessionToken()?.takeIf { it.isNotBlank() }?.let { headers.append("Authorization", "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(req)
            }
        if (!res.status.isSuccess()) return null
        return res.body()
    }

    suspend fun updateWordState(req: UpdateWordStateRequest): UpdateWordStateResponse? {
        val res =
            http.post("${Config.baseUrl}/api/update_jpdb_word_state") {
                getSessionToken()?.takeIf { it.isNotBlank() }?.let { headers.append("Authorization", "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(req)
            }
        if (!res.status.isSuccess()) return null
        return res.body()
    }

    suspend fun reviewCard(req: ReviewCardRequest): ReviewCardResponse? {
        val res =
            http.post("${Config.baseUrl}/api/review_jpdb_card") {
                getSessionToken()?.takeIf { it.isNotBlank() }?.let { headers.append("Authorization", "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(req)
            }
        if (!res.status.isSuccess()) return null
        return res.body()
    }
}


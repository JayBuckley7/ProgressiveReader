package com.progressivereader.kmp.vocabulary

import com.progressivereader.kmp.core.requireBackendSuccess
import com.progressivereader.kmp.core.newSaveIdentifier

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Serializable
data class Deck(
    val id: String,
    val name: String,
    val words: Int? = null,
)

data class JpdbVocabPair(val vid: Int, val sid: Int)

data class JpdbLookupEntry(
    val vid: Int,
    val sid: Int,
    val spelling: String? = null,
    val reading: String? = null,
    val frequencyRank: Int? = null,
    val meanings: List<String> = emptyList(),
    val dueAt: Long? = null,
    val cardStateRaw: JsonElement? = null,
)

@Serializable
data class AddVocabularyWordRequest(
    val word: String,
    val translation: String,
    val language: String = "English",
    val bookId: String? = null,
    val context: String? = null,
    val difficulty: String? = null,
)

@Serializable
data class AddVocabularyWordResponse(
    val success: Boolean,
    val id: String? = null,
)

@Serializable
data class VocabularyWord(
    val id: String,
    val word: String,
    val translation: String,
    val language: String,
    val bookId: String? = null,
    val context: String? = null,
    val difficulty: String? = null,
    val mastered: Boolean = false,
    val createdAt: String? = null,
)

@Serializable
data class ToggleMasteredRequest(val mastered: Boolean)

class VocabularyService(
    private val getSessionToken: () -> String?,
) {
    private val http = createHttpClient()

    @Serializable
    private data class ListUserDecksRequest(
        val jpdbApiKey: String,
    )

    @Serializable
    private data class ListDeckVocabularyRequest(
        val id: String,
        val jpdbApiKey: String,
    )

    @Serializable
    private data class ListDeckVocabularyResponse(
        val vocabulary: List<List<Int>> = emptyList(),
    )

    @Serializable
    private data class LookupVocabularyRequest(
        val list: List<List<Int>>,
        val fields: List<String>,
        val jpdbApiKey: String,
        @SerialName("chunkSize")
        val chunkSize: Int? = null,
    )

    @Serializable
    private data class LookupVocabularyResponse(
        @SerialName("vocabulary_info")
        val vocabularyInfo: List<JsonElement> = emptyList(),
    )

    private fun authHeader(): String? = getSessionToken()?.takeIf { it.isNotBlank() }

    suspend fun listUserDecks(jpdbApiKey: String): List<Deck> {
        val res =
            http.post("${Config.baseUrl}/api/list-user-decks") {
                authHeader()?.let { headers.append("Authorization", "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(ListUserDecksRequest(jpdbApiKey = jpdbApiKey))
            }
        res.requireBackendSuccess()
        return res.body<List<Deck>>()
    }

    suspend fun listDeckVocabulary(deckId: String, jpdbApiKey: String): List<JpdbVocabPair> {
        val res =
            http.post("${Config.baseUrl}/api/jpdb/deck/list-vocabulary") {
                authHeader()?.let { headers.append("Authorization", "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(ListDeckVocabularyRequest(id = deckId, jpdbApiKey = jpdbApiKey))
            }
        res.requireBackendSuccess()
        val payload = res.body<ListDeckVocabularyResponse>()
        return payload.vocabulary.mapNotNull { row ->
            val vid = row.getOrNull(0) ?: return@mapNotNull null
            val sid = row.getOrNull(1) ?: return@mapNotNull null
            JpdbVocabPair(vid = vid, sid = sid)
        }
    }

    suspend fun lookupVocabulary(
        pairs: List<JpdbVocabPair>,
        fields: List<String>,
        jpdbApiKey: String,
        chunkSize: Int? = null,
    ): List<JpdbLookupEntry> {
        if (pairs.isEmpty()) return emptyList()
        if (fields.isEmpty()) return emptyList()

        val res =
            http.post("${Config.baseUrl}/api/jpdb/lookup-vocabulary") {
                authHeader()?.let { headers.append("Authorization", "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(
                    LookupVocabularyRequest(
                        list = pairs.map { listOf(it.vid, it.sid) },
                        fields = fields,
                        jpdbApiKey = jpdbApiKey,
                        chunkSize = chunkSize,
                    )
                )
            }
        res.requireBackendSuccess()
        val payload = res.body<LookupVocabularyResponse>()
        val rows = payload.vocabularyInfo
        check(rows.size == pairs.size) { "JPDB returned an incomplete vocabulary page. Previous knowledge has been kept." }

        fun JsonElement?.asStringOrNull(): String? = (this as? JsonPrimitive)?.content?.trim()?.takeIf { it.isNotBlank() }

        fun JsonElement?.asIntOrNull(): Int? {
            val p = this as? JsonPrimitive ?: return null
            return p.content.toIntOrNull()
        }

        fun JsonElement?.asLongOrNull(): Long? {
            val p = this as? JsonPrimitive ?: return null
            return p.content.toLongOrNull()
        }

        fun JsonElement?.asStringList(): List<String> =
            (this as? JsonArray)
                ?.mapNotNull { (it as? JsonPrimitive)?.content?.trim()?.takeIf { s -> s.isNotBlank() } }
                .orEmpty()

        return pairs.mapIndexed { index, pair ->
            val row = rows.getOrNull(index) as? JsonArray
            val byField = mutableMapOf<String, JsonElement?>()
            fields.forEachIndexed { fieldIndex, field ->
                byField[field] = row?.getOrNull(fieldIndex)
            }

            JpdbLookupEntry(
                vid = pair.vid,
                sid = pair.sid,
                spelling = byField["spelling"].asStringOrNull(),
                reading = byField["reading"].asStringOrNull(),
                frequencyRank = byField["frequency_rank"].asIntOrNull(),
                meanings = byField["meanings"].asStringList(),
                dueAt = byField["due_at"].asLongOrNull(),
                cardStateRaw = byField["card_state"],
            )
        }
    }

    suspend fun getUserVocabulary(
        language: String? = null,
        mastered: Boolean? = null,
        bookId: String? = null,
    ): List<VocabularyWord> {
        val res =
            http.get("${Config.baseUrl}/api/vocabulary") {
                authHeader()?.let { headers.append("Authorization", "Bearer $it") }
                if (!language.isNullOrBlank()) parameter("language", language)
                if (mastered != null) parameter("mastered", mastered.toString())
                if (!bookId.isNullOrBlank()) parameter("bookId", bookId)
            }
        res.requireBackendSuccess()
        return res.body<List<VocabularyWord>>()
    }

    suspend fun addVocabularyWord(req: AddVocabularyWordRequest): AddVocabularyWordResponse? {
        val res =
            http.post("${Config.baseUrl}/api/vocabulary") {
                headers.append("Idempotency-Key", newSaveIdentifier())
                authHeader()?.let { headers.append("Authorization", "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(req)
            }
        res.requireBackendSuccess()
        return res.body()
    }

    suspend fun toggleMastered(wordId: String, mastered: Boolean): VocabularyWord? {
        val res =
            http.patch("${Config.baseUrl}/api/vocabulary/$wordId/mastered") {
                headers.append("Idempotency-Key", newSaveIdentifier())
                authHeader()?.let { headers.append("Authorization", "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(ToggleMasteredRequest(mastered = mastered))
            }
        res.requireBackendSuccess()
        return res.body()
    }
}

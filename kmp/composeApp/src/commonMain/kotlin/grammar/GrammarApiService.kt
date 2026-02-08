package com.progressivereader.kmp.grammar

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

class GrammarApiService(
    private val getSessionToken: () -> String?,
) {
    private val http = createHttpClient()

    @Serializable
    data class GrammarInfo(
        val id: String,
        val title: String,
        val meaning: String,
        val level: String, // n5..n1
    )

    @Serializable
    data class Span(
        val start: Int,
        val end: Int,
        val text: String? = null,
    )

    @Serializable
    data class GrammarValidateCandidate(
        val id: String,
        val sentence: String,
        val before: String? = null,
        val after: String? = null,
        val hintSpan: Span? = null,
    )

    @Serializable
    data class ValidateExamplesRequest(
        val grammar: GrammarInfo,
        val candidates: List<GrammarValidateCandidate>,
        @SerialName("maxResults")
        val maxResults: Int = 3,
        val model: String = "gpt-4o-mini",
        @SerialName("apiKey")
        val apiKey: String? = null,
    )

    @Serializable
    data class GrammarValidateMatch(
        val candidateId: String,
        val isMatch: Boolean,
        val confidence: Double? = null,
        val matchSpan: Span? = null,
        val explanation: String? = null,
    )

    @Serializable
    data class ValidateExamplesResponse(
        val matches: List<GrammarValidateMatch> = emptyList(),
    )

    @Serializable
    data class TeachExampleIn(
        val exampleId: String,
        val sentence: String,
        val before: String? = null,
        val after: String? = null,
        val matchSpan: Span? = null,
    )

    @Serializable
    data class TeachExamplesRequest(
        val grammar: GrammarInfo,
        val examples: List<TeachExampleIn>,
        val model: String = "gpt-4o-mini",
        @SerialName("apiKey")
        val apiKey: String? = null,
    )

    @Serializable
    data class TeachExampleOut(
        val exampleId: String,
        val translation: String? = null,
        val breakdown: String? = null,
        val usageNote: String? = null,
        val contrast: GrammarTeachingContrast? = null,
    )

    @Serializable
    data class TeachExamplesResponse(
        val teachings: List<TeachExampleOut> = emptyList(),
    )

    private fun authHeader(): String? = getSessionToken()?.trim()?.takeIf { it.isNotBlank() }

    private suspend inline fun <reified T> requireOk(res: HttpResponse): T {
        if (!res.status.isSuccess()) {
            val text = runCatching { res.bodyAsText() }.getOrNull().orEmpty()
            throw IllegalStateException(text.ifBlank { "HTTP ${res.status.value}" })
        }
        return res.body()
    }

    suspend fun validateExamples(req: ValidateExamplesRequest): ValidateExamplesResponse {
        val res =
            http.post("${Config.baseUrl}/api/grammar/validate-examples") {
                authHeader()?.let { headers.append(HttpHeaders.Authorization, "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(req)
            }
        return requireOk(res)
    }

    suspend fun teachExamples(req: TeachExamplesRequest): TeachExamplesResponse {
        val res =
            http.post("${Config.baseUrl}/api/grammar/teach-examples") {
                authHeader()?.let { headers.append(HttpHeaders.Authorization, "Bearer $it") }
                contentType(ContentType.Application.Json)
                setBody(req)
            }
        return requireOk(res)
    }
}

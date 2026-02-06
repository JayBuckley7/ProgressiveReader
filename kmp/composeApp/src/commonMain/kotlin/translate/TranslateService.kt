package com.progressivereader.kmp.translate

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable

class TranslateService(private val getSessionToken: () -> String?) {
    private val http = createHttpClient()

    @Serializable
    data class ChapterTranslateRequest(
        val content: String,
        val target_lang: String = "English",
        val source_lang: String? = null,
        val model: String = "gpt-4o-mini",
        val api_key: String? = null,
        val stream: Boolean = false,
        val use_cefr: Boolean = false,
        val cefr_level: String? = null,
        val translation_service: String = "openai"
    )

    @Serializable
    data class TranslateResponse(val translated_text: String)

    suspend fun translateChapter(req: ChapterTranslateRequest): TranslateResponse? {
        val token = getSessionToken() ?: return null
        val res = http.post("${Config.baseUrl}/api/translate/chapter") {
            headers.append("Authorization", "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(req)
        }
        if (!res.status.isSuccess()) return null
        return res.body()
    }
}


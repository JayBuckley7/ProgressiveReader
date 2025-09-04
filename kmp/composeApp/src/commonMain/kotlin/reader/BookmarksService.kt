package com.progressivereader.kmp.reader

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable

class BookmarksService(private val getSessionToken: () -> String?) {
    private val http = createHttpClient()

    @Serializable
    data class Bookmark(
        val id: String? = null,
        val bookId: String,
        val chapterIndex: Int,
        val position: Int,
        val note: String? = null,
        val createdAt: String? = null,
    )

    suspend fun list(bookId: String): List<Bookmark> {
        val token = getSessionToken() ?: return emptyList()
        val res = http.get("${Config.baseUrl}/api/bookmarks?bookId=$bookId") {
            headers.append("Authorization", "Bearer $token")
        }
        if (!res.status.isSuccess()) return emptyList()
        return res.body()
    }

    suspend fun add(bookId: String, chapterIndex: Int, position: Int, note: String?): Bookmark? {
        val token = getSessionToken() ?: return null
        val res = http.post("${Config.baseUrl}/api/bookmarks") {
            headers.append("Authorization", "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "bookId" to bookId,
                "chapterIndex" to chapterIndex,
                "position" to position,
                "note" to note
            ))
        }
        if (!res.status.isSuccess()) return null
        return res.body()
    }
}



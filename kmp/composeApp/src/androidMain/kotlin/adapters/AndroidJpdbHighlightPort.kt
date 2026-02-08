package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.jpdb.JpdbService
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.ports.JpdbHighlightPort
import com.progressivereader.kmp.ports.JpdbHighlightResult
import com.progressivereader.kmp.ports.TimePort
import com.progressivereader.kmp.reader.JpdbHighlighter
import com.progressivereader.kmp.reader.JpdbTokenCache
import com.progressivereader.kmp.reader.JpdbTokenCacheFile
import java.util.Locale
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

class AndroidJpdbHighlightPort(
    private val bookCache: BookCache,
    private val timePort: TimePort,
) : JpdbHighlightPort {
    private val tokenCacheByBookId = HashMap<String, JpdbTokenCache>()
    private val highlighterByBookId = HashMap<String, JpdbHighlighter>()

    private fun tokenCacheFor(bookId: String): JpdbTokenCache =
        tokenCacheByBookId.getOrPut(bookId) { JpdbTokenCache(bookCache.bookDir(bookId)) }

    private fun highlighterFor(bookId: String): JpdbHighlighter =
        highlighterByBookId.getOrPut(bookId) {
            JpdbHighlighter(
                tokenCache = tokenCacheFor(bookId),
                jpdbService = JpdbService(),
            )
        }

    override suspend fun highlightChapter(
        bookId: String,
        bodyHtml: String,
        chapterIndex: Int,
        sourceHash: String,
        jpdbApiKey: String,
        isOnline: Boolean,
    ): JpdbHighlightResult? {
        val res =
            highlighterFor(bookId).highlightChapter(
                bodyHtml = bodyHtml,
                chapterIndex = chapterIndex,
                sourceHash = sourceHash,
                jpdbApiKey = jpdbApiKey,
                isOnline = isOnline,
            ) ?: return null

        return JpdbHighlightResult(html = res.html, tokenById = res.tokenById)
    }

    override suspend fun updateCachedTokenState(
        bookId: String,
        chapterIndex: Int,
        sourceHash: String,
        tokenId: String,
        tokenById: Map<String, JpdbService.ProcessedToken>,
        nextState: List<String>,
    ): Boolean {
        val cache = tokenCacheFor(bookId)
        val cached = cache.loadIfValid(chapterIndex, sourceHash) ?: return false

        val nextStateElement = JsonArray(nextState.map { JsonPrimitive(it) })

        fun JsonElement?.asStringOrNull(): String? =
            (this as? JsonPrimitive)?.content?.trim()?.takeIf { it.isNotBlank() }

        val targetVidSid: Pair<String, String>? =
            run {
                // Token ids are `${vid}/${sid}@${start}-${end}` when card metadata is available.
                val prefix = tokenId.substringBefore("@", missingDelimiterValue = "")
                if (prefix.contains("/")) {
                    val parts = prefix.split("/", limit = 2)
                    val vid = parts.getOrNull(0)?.takeIf { it.isNotBlank() }
                    val sid = parts.getOrNull(1)?.takeIf { it.isNotBlank() }
                    if (vid != null && sid != null) return@run vid to sid
                }

                // Fallback: look up the token data we used to render the current highlighted HTML.
                val token = tokenById[tokenId]
                val vid = token?.card?.get("vid").asStringOrNull()
                val sid = token?.card?.get("sid").asStringOrNull()
                if (vid != null && sid != null) vid to sid else null
            }

        val updatedTokens =
            cached.tokens.map { ct ->
                val shouldUpdate =
                    if (targetVidSid != null) {
                        val (targetVid, targetSid) = targetVidSid
                        val vid = (ct.card["vid"] as? JsonPrimitive)?.content
                        val sid = (ct.card["sid"] as? JsonPrimitive)?.content
                        vid == targetVid && sid == targetSid
                    } else {
                        ct.id == tokenId
                    }
                if (!shouldUpdate) return@map ct
                val updatedCard = JsonObject(ct.card.toMutableMap().apply { this["state"] = nextStateElement })
                ct.copy(card = updatedCard)
            }

        cache.save(
            chapterIndex = chapterIndex,
            entry =
                JpdbTokenCacheFile(
                    createdAt = timePort.nowIsoUtc(),
                    sourceHash = sourceHash,
                    tokens = updatedTokens,
                ),
        )
        return true
    }
}


package com.progressivereader.kmp.reader

import com.progressivereader.kmp.jpdb.JpdbService
import java.nio.file.Files
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class ReaderCacheTest {
    @Test
    fun translationCache_roundTrip_and_invalidation() = runBlocking {
        val dir = Files.createTempDirectory("pr-translation-cache").toFile()
        val cache = TranslationCache(dir)

        val entry =
            TranslationCacheEntry(
                createdAt = TranslationCache.isoNowUtc(),
                targetLang = "English",
                useCefr = false,
                cefrLevel = "B1",
                sourceHash = "hash1",
                html = "<p>Hello</p>",
            )
        cache.save(0, entry)

        val ok =
            cache.loadIfValid(
                0,
                sourceHash = "hash1",
                targetLang = "English",
                useCefr = false,
                cefrLevel = "B1",
            )
        assertNotNull(ok)
        assertEquals("<p>Hello</p>", ok.html)

        val wrongHash =
            cache.loadIfValid(
                0,
                sourceHash = "hash2",
                targetLang = "English",
                useCefr = false,
                cefrLevel = "B1",
            )
        assertNull(wrongHash)

        val wrongLang =
            cache.loadIfValid(
                0,
                sourceHash = "hash1",
                targetLang = "Japanese",
                useCefr = false,
                cefrLevel = "B1",
            )
        assertNull(wrongLang)
    }

    @Test
    fun jpdbTokenCache_roundTrip_and_invalidation() = runBlocking {
        val dir = Files.createTempDirectory("pr-jpdb-cache").toFile()
        val cache = JpdbTokenCache(dir)

        val token =
            CachedJpdbToken(
                id = "@0-2",
                start = 0,
                length = 2,
                end = 2,
                card =
                    buildJsonObject {
                        put("spelling", JsonPrimitive("漢字"))
                        put("state", JsonArray(listOf(JsonPrimitive("known"))))
                    },
                rubies = emptyList(),
            )

        cache.save(
            0,
            JpdbTokenCacheFile(
                createdAt = TranslationCache.isoNowUtc(),
                sourceHash = "hash1",
                tokens = listOf(token),
            ),
        )

        val ok = cache.loadIfValid(0, sourceHash = "hash1")
        assertNotNull(ok)
        assertEquals(1, ok.tokens.size)

        val wrong = cache.loadIfValid(0, sourceHash = "hash2")
        assertNull(wrong)
    }

    @Test
    fun jpdbHighlighter_ignoresRt_and_wrapsBaseText() = runBlocking {
        val dir = Files.createTempDirectory("pr-jpdb-highlighter").toFile()
        val tokenCache = JpdbTokenCache(dir)

        val bodyHtml = "<p><ruby>漢字<rt>かんじ</rt></ruby>です</p>"
        val sourceHash = "hash1"

        val processed =
            JpdbService.ProcessedToken(
                start = 0,
                length = 2,
                end = 2,
                card =
                    buildJsonObject {
                        put("state", JsonArray(listOf(JsonPrimitive("known"))))
                        put("spelling", JsonPrimitive("漢字"))
                        put("reading", JsonPrimitive("かんじ"))
                    },
                rubies = emptyList(),
            )
        val cachedToken = JpdbTokenCache.toCachedToken(processed)
        tokenCache.save(
            0,
            JpdbTokenCacheFile(
                createdAt = TranslationCache.isoNowUtc(),
                sourceHash = sourceHash,
                tokens = listOf(cachedToken),
            ),
        )

        val highlighter = JpdbHighlighter(tokenCache = tokenCache, jpdbService = JpdbService())
        val res =
            highlighter.highlightChapter(
                bodyHtml = bodyHtml,
                chapterIndex = 0,
                sourceHash = sourceHash,
                jpdbApiKey = "ignored",
                isOnline = false,
            )
        assertNotNull(res)

        // Base text should be wrapped and tappable.
        assertTrue(res.html.contains("href=\"pr://jpdb?tid=${cachedToken.id}\""))
        assertTrue(res.html.contains(">漢字</a>"))

        // Furigana should remain, and must not be wrapped.
        assertTrue(res.html.contains("<rt>かんじ</rt>"))
        assertFalse(res.html.contains(">かんじ</a>"))
    }

    @Test
    fun translatedHtmlSanitizer_unwrapsAnchors_and_allowsTokenWrapping() = runBlocking {
        val dir = Files.createTempDirectory("pr-jpdb-highlighter-anchors").toFile()
        val tokenCache = JpdbTokenCache(dir)

        // Simulate common LLM failure mode: an unclosed <a> tag that wraps the whole fragment.
        val brokenTranslatedHtml = "<a href=\"https://example.com\"><p><ruby>漢字<rt>かんじ</rt></ruby>です</p>"
        val sanitized = TranslatedHtmlSanitizer.sanitizeBodyHtml(brokenTranslatedHtml)
        assertFalse(sanitized.contains("<a"))

        val sourceHash = "hash1"
        val processed =
            JpdbService.ProcessedToken(
                start = 0,
                length = 2,
                end = 2,
                card =
                    buildJsonObject {
                        put("state", JsonArray(listOf(JsonPrimitive("known"))))
                        put("spelling", JsonPrimitive("漢字"))
                        put("reading", JsonPrimitive("かんじ"))
                    },
                rubies = emptyList(),
            )
        val cachedToken = JpdbTokenCache.toCachedToken(processed)
        tokenCache.save(
            0,
            JpdbTokenCacheFile(
                createdAt = TranslationCache.isoNowUtc(),
                sourceHash = sourceHash,
                tokens = listOf(cachedToken),
            ),
        )

        val highlighter = JpdbHighlighter(tokenCache = tokenCache, jpdbService = JpdbService())

        // Broken HTML: base text is inside <a>, so we avoid wrapping and nothing becomes tappable.
        val brokenRes =
            highlighter.highlightChapter(
                bodyHtml = brokenTranslatedHtml,
                chapterIndex = 0,
                sourceHash = sourceHash,
                jpdbApiKey = "ignored",
                isOnline = false,
            )
        assertNotNull(brokenRes)
        assertFalse(brokenRes.html.contains("href=\"pr://jpdb?tid=${cachedToken.id}\""))

        // Sanitized HTML: anchor is removed, so token wrapping works.
        val okRes =
            highlighter.highlightChapter(
                bodyHtml = sanitized,
                chapterIndex = 0,
                sourceHash = sourceHash,
                jpdbApiKey = "ignored",
                isOnline = false,
            )
        assertNotNull(okRes)
        assertTrue(okRes.html.contains("href=\"pr://jpdb?tid=${cachedToken.id}\""))
    }
}

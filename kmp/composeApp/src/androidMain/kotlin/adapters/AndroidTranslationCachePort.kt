package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.domain.reader.TranslationCacheEntry
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.ports.TranslationCachePort
import com.progressivereader.kmp.reader.TranslatedHtmlSanitizer
import com.progressivereader.kmp.reader.TranslationCache

class AndroidTranslationCachePort(
    private val bookCache: BookCache,
) : TranslationCachePort {
    // Small in-memory cache of helpers per book to reuse their mutex/json instances.
    private val cacheByBookId = HashMap<String, TranslationCache>()

    private fun cacheFor(bookId: String): TranslationCache =
        cacheByBookId.getOrPut(bookId) { TranslationCache(bookCache.bookDir(bookId)) }

    override suspend fun loadIfValid(
        bookId: String,
        chapterIndex: Int,
        sourceHash: String,
        targetLang: String,
        useCefr: Boolean,
        cefrLevel: String,
    ): TranslationCacheEntry? =
        cacheFor(bookId)
            .loadIfValid(
                chapterIndex = chapterIndex,
                sourceHash = sourceHash,
                targetLang = targetLang,
                useCefr = useCefr,
                cefrLevel = cefrLevel,
            )
            ?.let { entry ->
                val sanitized = TranslatedHtmlSanitizer.sanitizeBodyHtml(entry.html)
                if (sanitized == entry.html) return@let entry

                // Opportunistically repair older cached translations created before we sanitized output.
                val updated = entry.copy(html = sanitized)
                runCatching { cacheFor(bookId).save(chapterIndex, updated) }
                updated
            }

    override suspend fun save(bookId: String, chapterIndex: Int, entry: TranslationCacheEntry) {
        val sanitized = TranslatedHtmlSanitizer.sanitizeBodyHtml(entry.html)
        cacheFor(bookId).save(chapterIndex, entry.copy(html = sanitized))
    }
}

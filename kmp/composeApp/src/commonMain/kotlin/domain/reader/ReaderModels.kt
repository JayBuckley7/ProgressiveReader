package com.progressivereader.kmp.domain.reader

import com.progressivereader.kmp.settings.ReaderSettings
import kotlinx.serialization.Serializable

enum class BookFormat {
    EPUB,
    PDF,
    TXT,
}

data class ChapterContent(
    val headHtml: String,
    val bodyHtml: String,
    val baseUrl: String?,
    val sourceHash: String,
)

@Serializable
data class Bookmark(
    val chapterIndex: Int,
    val label: String? = null,
    val createdAt: String,
)

@Serializable
data class BookState(
    val version: Int = 1,
    val lastChapterIndex: Int = 0,
    val lastPdfPageIndex: Int = 0,
    val bookmarks: List<Bookmark> = emptyList(),
    val readerSettingsOverride: ReaderSettings? = null,
)

@Serializable
data class TranslationCacheEntry(
    val version: Int = 1,
    val createdAt: String,
    val targetLang: String,
    val useCefr: Boolean,
    val cefrLevel: String,
    val sourceHash: String,
    val html: String,
)


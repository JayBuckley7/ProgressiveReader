package com.progressivereader.kmp.ports

import com.progressivereader.kmp.jpdb.JpdbService

data class JpdbHighlightResult(
    val html: String,
    val tokenById: Map<String, JpdbService.ProcessedToken>,
)

interface JpdbHighlightPort {
    suspend fun highlightChapter(
        bookId: String,
        bodyHtml: String,
        chapterIndex: Int,
        sourceHash: String,
        jpdbApiKey: String,
        isOnline: Boolean,
    ): JpdbHighlightResult?

    suspend fun updateCachedTokenState(
        bookId: String,
        chapterIndex: Int,
        sourceHash: String,
        tokenId: String,
        tokenById: Map<String, JpdbService.ProcessedToken>,
        nextState: List<String>,
    ): Boolean
}


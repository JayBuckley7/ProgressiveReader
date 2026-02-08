package com.progressivereader.kmp.ports

import com.progressivereader.kmp.domain.reader.TranslationCacheEntry

interface TranslationCachePort {
    suspend fun loadIfValid(
        bookId: String,
        chapterIndex: Int,
        sourceHash: String,
        targetLang: String,
        useCefr: Boolean,
        cefrLevel: String,
    ): TranslationCacheEntry?

    suspend fun save(
        bookId: String,
        chapterIndex: Int,
        entry: TranslationCacheEntry,
    )
}


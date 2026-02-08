package com.progressivereader.kmp.ports

interface TranslationPort {
    /**
     * Returns sanitized body HTML (safe for token wrapping).
     */
    suspend fun translateChapterToHtml(
        content: String,
        targetLang: String,
        model: String,
        apiKey: String?,
        useCefr: Boolean,
        cefrLevel: String,
    ): String?
}


package com.progressivereader.kmp.ports

import com.progressivereader.kmp.grammar.GrammarPoint
import com.progressivereader.kmp.jpdb.JpdbService

interface GrammarUnderlinePort {
    suspend fun underline(
        highlightedBodyHtml: String,
        tokenById: Map<String, JpdbService.ProcessedToken>,
        learningPoints: List<GrammarPoint>,
    ): String
}


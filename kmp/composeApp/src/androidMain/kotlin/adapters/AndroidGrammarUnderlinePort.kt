package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.grammar.GrammarPoint
import com.progressivereader.kmp.grammar.GrammarUnderliner
import com.progressivereader.kmp.jpdb.JpdbService
import com.progressivereader.kmp.ports.GrammarUnderlinePort

class AndroidGrammarUnderlinePort : GrammarUnderlinePort {
    override suspend fun underline(
        highlightedBodyHtml: String,
        tokenById: Map<String, JpdbService.ProcessedToken>,
        learningPoints: List<GrammarPoint>,
    ): String =
        GrammarUnderliner.apply(
            highlightedBodyHtml = highlightedBodyHtml,
            tokenById = tokenById,
            learningPoints = learningPoints,
        )
}


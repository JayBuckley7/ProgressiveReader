package com.progressivereader.kmp.ports

import com.progressivereader.kmp.mix.EnglishSwapHighlighter

interface MixApplyPort {
    suspend fun applyMixSwaps(
        bodyHtml: String,
        highlighter: EnglishSwapHighlighter,
    ): String
}


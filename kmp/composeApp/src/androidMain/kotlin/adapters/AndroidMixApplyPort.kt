package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.mix.EnglishSwapHighlighter
import com.progressivereader.kmp.mix.applyEnglishSwapToBodyHtml
import com.progressivereader.kmp.ports.MixApplyPort
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidMixApplyPort : MixApplyPort {
    override suspend fun applyMixSwaps(
        bodyHtml: String,
        highlighter: EnglishSwapHighlighter,
    ): String =
        withContext(Dispatchers.Default) {
            applyEnglishSwapToBodyHtml(
                bodyHtml = bodyHtml,
                highlighter = highlighter,
            )
        }
}


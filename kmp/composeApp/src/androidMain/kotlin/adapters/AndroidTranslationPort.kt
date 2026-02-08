package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.ports.TranslationPort
import com.progressivereader.kmp.reader.TranslatedHtmlSanitizer
import com.progressivereader.kmp.translate.TranslateService

class AndroidTranslationPort(
    private val getSessionJwt: () -> String?,
) : TranslationPort {
    private val service = TranslateService(getSessionToken = getSessionJwt)

    override suspend fun translateChapterToHtml(
        content: String,
        targetLang: String,
        model: String,
        apiKey: String?,
        useCefr: Boolean,
        cefrLevel: String,
    ): String? {
        val resp =
            service.translateChapter(
                TranslateService.ChapterTranslateRequest(
                    content = content,
                    target_lang = targetLang,
                    model = model,
                    api_key = apiKey?.trim().orEmpty(),
                    use_cefr = useCefr,
                    cefr_level = cefrLevel,
                ),
            ) ?: return null

        return TranslatedHtmlSanitizer.sanitizeBodyHtml(resp.translated_text)
    }
}


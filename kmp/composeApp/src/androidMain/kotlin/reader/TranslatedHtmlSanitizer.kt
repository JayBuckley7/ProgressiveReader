package com.progressivereader.kmp.reader

import org.jsoup.Jsoup

/**
 * The translation service returns "HTML", but LLM output can contain malformed markup
 * (notably unclosed <a> tags) that can swallow the whole document and break:
 * - Android WebView text selection (everything becomes a link)
 * - JPDB token wrapping (we avoid nesting anchors, so nothing gets wrapped)
 *
 * We treat translated content as a body fragment and aggressively unwrap anchors.
 */
object TranslatedHtmlSanitizer {
    fun sanitizeBodyHtml(html: String): String {
        val hasDocTags = DOC_TAG_REGEX.containsMatchIn(html)
        val doc =
            if (hasDocTags) {
                Jsoup.parse(html)
            } else {
                Jsoup.parseBodyFragment(html)
            }
        doc.outputSettings().prettyPrint(false)

        // Remove potentially-dangerous / layout-breaking tags from model output.
        doc.select("script, iframe, object, embed, form, style, link, meta").remove()

        // Unwrap all anchors so token wrapping can safely introduce its own <a> tags.
        doc.select("a").forEach { it.unwrap() }

        // Return inner body HTML (consistent with EpubRepository.sanitizeChapterBytes).
        return doc.body().html()
    }

    private val DOC_TAG_REGEX = Regex("(?i)<\\s*(html|head|body)\\b")
}


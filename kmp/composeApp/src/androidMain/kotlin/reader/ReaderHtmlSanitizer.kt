package com.progressivereader.kmp.reader

import org.jsoup.Jsoup
import org.jsoup.nodes.Document

/** EPUBs and provider output are documents, never application code. */
internal object ReaderHtmlSanitizer {
    private val attributes = setOf("rel", "type", "media", "id", "class", "title", "lang", "dir", "style", "href", "src", "alt", "width", "height", "colspan", "rowspan", "scope", "role", "xmlns", "viewbox", "d", "fill", "stroke", "stroke-width", "transform", "x", "y", "cx", "cy", "r", "rx", "ry", "x1", "x2", "y1", "y2", "points", "preserveaspectratio")
    private val unsafeScheme = Regex("(?i)^(javascript|vbscript|data|intent|content):")
    private val readerColors = Regex("(?i)(^|;)\\s*(color|background(?:-color)?|-webkit-text-fill-color)\\s*:[^;]*")

    fun sanitize(doc: Document) {
        doc.select("script, iframe, object, embed, form, input, button, textarea, select, meta, base, foreignObject, animate, set, animateTransform").remove()
        doc.allElements.forEach { element ->
            element.attributes().asList().forEach { attribute ->
                val key = attribute.key.lowercase()
                if (key !in attributes && !key.startsWith("aria-") && !key.startsWith("data-pr-")) {
                    element.removeAttr(attribute.key)
                } else if (key == "href" || key == "src") {
                    val normalized = attribute.value.filterNot { it.isWhitespace() || it.code < 32 }
                    if (unsafeScheme.containsMatchIn(normalized)) element.removeAttr(attribute.key)
                } else if (key == "style") {
                    val value = attribute.value
                    if (value.contains(Regex("(?i)expression\\s*\\(|javascript\\s*:|@import|-moz-binding"))) {
                        element.removeAttr("style")
                    } else {
                        // Text/background colors belong to the reader theme, including inline !important rules.
                        element.attr("style", readerColors.replace(value, "$1"))
                    }
                }
            }
        }
    }

    fun body(html: String): String = Jsoup.parseBodyFragment(html).apply {
        outputSettings().prettyPrint(false)
        sanitize(this)
    }.body().html()
}

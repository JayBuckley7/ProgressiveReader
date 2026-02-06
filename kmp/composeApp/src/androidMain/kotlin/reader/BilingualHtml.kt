package com.progressivereader.kmp.reader

import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.parser.Tag

/**
 * Build a "bilingual" body fragment from:
 * - the original (JP) chapter body HTML
 * - the translated chapter body HTML
 *
 * The returned HTML keeps the original text nodes intact so JPDB highlighting can tokenize/wrap
 * them, and injects translated content as `.pr-translation` nodes which the highlighter ignores.
 */
object BilingualHtml {
    private fun collectBlocks(root: Element): List<Element> =
        root.select("p, li, h1, h2, h3, h4, h5, h6").filter { el ->
            el.text().replace(Regex("\\s+"), " ").trim().isNotBlank()
        }

    fun buildBodyHtml(originalBodyHtml: String, translatedBodyHtml: String): String {
        val origDoc = Jsoup.parseBodyFragment(originalBodyHtml).apply { outputSettings().prettyPrint(false) }
        val transDoc = Jsoup.parseBodyFragment(translatedBodyHtml).apply { outputSettings().prettyPrint(false) }

        // If an older cache already injected translation nodes, strip them.
        origDoc.select(".pr-translation, [data-pr-translation]").remove()

        val origBlocks = collectBlocks(origDoc.body())
        val transBlocks = collectBlocks(transDoc.body())

        if (origBlocks.isEmpty() || transBlocks.isEmpty()) {
            val fallback = Element(Tag.valueOf("div"), "")
            fallback.addClass("pr-translation")
            fallback.attr("data-pr-translation", "1")
            fallback.html(transDoc.body().html())
            origDoc.body().appendChild(fallback)
            return origDoc.body().html()
        }

        val ratio = minOf(origBlocks.size, transBlocks.size).toFloat() / maxOf(origBlocks.size, transBlocks.size).toFloat()
        if (ratio < 0.5f) {
            // Avoid injecting misaligned line-by-line translations when the structure drifted too far.
            val fallback = Element(Tag.valueOf("div"), "")
            fallback.addClass("pr-translation")
            fallback.attr("data-pr-translation", "1")
            fallback.html(transDoc.body().html())
            origDoc.body().appendChild(fallback)
            return origDoc.body().html()
        }

        var j = 0
        for (origEl in origBlocks) {
            if (j >= transBlocks.size) break

            val wantTag = origEl.tagName()
            var k = j
            while (k < transBlocks.size && transBlocks[k].tagName() != wantTag) k++
            val transEl = (if (k < transBlocks.size) transBlocks[k] else transBlocks[j])
            j = (if (k < transBlocks.size) k else j) + 1

            val html = transEl.html().trim()
            if (html.isBlank()) continue

            val translatedNode = Element(Tag.valueOf("div"), "")
            translatedNode.addClass("pr-translation")
            translatedNode.attr("data-pr-translation", "1")
            translatedNode.html(html)

            if (origEl.tagName().equals("li", ignoreCase = true)) {
                // Keep bullet counts stable by injecting inside the <li>.
                val childList =
                    origEl.children().firstOrNull { c ->
                        c.tagName().equals("ul", ignoreCase = true) || c.tagName().equals("ol", ignoreCase = true)
                    }
                if (childList != null) childList.before(translatedNode) else origEl.appendChild(translatedNode)
            } else {
                origEl.after(translatedNode)
            }
        }

        return origDoc.body().html()
    }
}

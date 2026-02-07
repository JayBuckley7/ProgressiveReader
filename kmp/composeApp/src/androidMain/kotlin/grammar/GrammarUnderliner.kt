package com.progressivereader.kmp.grammar

import com.progressivereader.kmp.jpdb.JpdbService
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode

object GrammarUnderliner {
    private data class Span(val start: Int, val end: Int)

    fun apply(
        highlightedBodyHtml: String,
        tokenById: Map<String, JpdbService.ProcessedToken>,
        learningPoints: List<GrammarPoint>,
    ): String {
        if (highlightedBodyHtml.isBlank()) return highlightedBodyHtml
        if (learningPoints.isEmpty()) return highlightedBodyHtml
        if (tokenById.isEmpty()) return highlightedBodyHtml

        val doc = Jsoup.parseBodyFragment(highlightedBodyHtml)
        val body = doc.body()
        val context = extractGlobalText(body)
        if (context.isBlank()) return highlightedBodyHtml

        val spansByGrammarId = LinkedHashMap<String, List<Span>>()
        for (p in learningPoints) {
            if (p.hintQuality != HintQuality.OK) continue
            if (p.hints.isEmpty()) continue
            val spans = findHintSpans(context, p.hints)
            if (spans.isNotEmpty()) spansByGrammarId[p.id] = spans
        }
        if (spansByGrammarId.isEmpty()) return highlightedBodyHtml

        val wordEls = body.select("a.jpdb-word")
        if (wordEls.isEmpty()) return highlightedBodyHtml

        for (el in wordEls) {
            val tid = parseTid(el.attr("href")) ?: continue
            val token = tokenById[tid] ?: continue
            val tStart = token.start
            val tEnd = token.end
            if (tEnd <= tStart) continue

            var hit = false
            for ((gid, spans) in spansByGrammarId) {
                if (spans.any { overlaps(tStart, tEnd, it.start, it.end) }) {
                    addGrammarId(el, gid)
                    hit = true
                }
            }
            if (hit) el.addClass("pr-grammar-hit--candidate")
        }

        return body.html()
    }

    private fun overlaps(aStart: Int, aEnd: Int, bStart: Int, bEnd: Int): Boolean = aStart < bEnd && aEnd > bStart

    private fun findHintSpans(text: String, hints: List<String>): List<Span> {
        val spans = ArrayList<Span>()
        for (hint in hints) {
            val h = hint.trim()
            if (h.isBlank()) continue
            var idx = text.indexOf(h, startIndex = 0)
            while (idx >= 0) {
                spans.add(Span(start = idx, end = idx + h.length))
                idx = text.indexOf(h, startIndex = idx + maxOf(1, h.length))
            }
        }
        return spans
    }

    private fun addGrammarId(el: Element, grammarId: String) {
        val raw = el.attr("data-pr-grammar-ids").orEmpty()
        val set =
            raw.split(',')
                .map { it.trim() }
                .filter { it.isNotBlank() }
                .toMutableSet()
        set.add(grammarId)
        el.attr("data-pr-grammar-ids", set.joinToString(","))
    }

    private fun parseTid(href: String?): String? {
        val s = href?.trim().orEmpty()
        val idx = s.indexOf("tid=")
        if (idx < 0) return null
        val tail = s.substring(idx + 4)
        return tail.substringBefore('&').trim().takeIf { it.isNotBlank() }
    }

    // Mirror the text traversal rules in reader/JpdbHighlighter.kt so offsets remain aligned.
    private fun extractGlobalText(body: Element): String {
        val sb = StringBuilder()

        fun process(node: Node) {
            when (node) {
                is TextNode -> {
                    val text = node.text().replace('\u00A0', ' ')
                    if (text.trim().isNotEmpty()) sb.append(text)
                }

                is Element -> {
                    if (node.hasClass("pr-translation") || node.hasAttr("data-pr-translation")) return
                    val name = node.tagName().lowercase()
                    if (name == "rt" || name == "rp") return
                    node.childNodes().forEach(::process)
                }

                else -> Unit
            }
        }

        process(body)
        return sb.toString()
    }
}


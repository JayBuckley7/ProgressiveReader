package com.progressivereader.kmp.mix

import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode

/**
 * Apply mix-mode swaps to HTML by transforming plain text nodes.
 *
 * This mirrors the web approach (parseHtmlToJsx + highlighterFn) but runs locally since WebView
 * JavaScript is disabled.
 */
fun applyEnglishSwapToBodyHtml(bodyHtml: String, highlighter: EnglishSwapHighlighter): String {
    if (bodyHtml.isBlank()) return bodyHtml

    val doc = Jsoup.parseBodyFragment(bodyHtml)
    val body = doc.body()

    fun hasAncestorTag(node: Node, tag: String): Boolean {
        var p: Node? = node.parent()
        while (p is Element) {
            if (p.tagName().equals(tag, ignoreCase = true)) return true
            p = p.parent()
        }
        return false
    }

    fun process(node: Node) {
        when (node) {
            is TextNode -> {
                if (hasAncestorTag(node, "a")) return
                val text = node.text()
                val swapped = highlighter.highlightText(text)
                if (swapped != text) node.text(swapped)
            }

            is Element -> {
                if (node.hasClass("pr-translation") || node.hasAttr("data-pr-translation")) return
                val name = node.tagName().lowercase()
                if (name == "script" || name == "style") return
                node.childNodes().forEach(::process)
            }

            else -> Unit
        }
    }

    process(body)
    return body.html()
}


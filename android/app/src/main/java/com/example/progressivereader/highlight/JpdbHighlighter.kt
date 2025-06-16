package com.example.progressivereader.highlight

import org.jsoup.nodes.Element
import org.jsoup.nodes.TextNode

/**
 * Utility functions that roughly mirror the logic in frontend/src/index.ts
 * for extracting text segments and applying JPDB token data to HTML using jsoup.
 */
object JpdbHighlighter {

    fun extractCleanTextSegments(root: Element): List<String> {
        val segments = mutableListOf<String>()
        val current = StringBuilder()

        fun flush() {
            val trimmed = current.toString().trim()
            if (trimmed.isNotEmpty()) segments += trimmed
            current.setLength(0)
        }

        fun process(node: org.jsoup.nodes.Node) {
            when (node) {
                is TextNode -> current.append(node.text())
                is Element -> when (node.tagName().lowercase()) {
                    "rt" -> {}
                    "ruby" -> node.childNodes().forEach { process(it) }
                    "p", "div", "section", "br" -> {
                        flush(); node.childNodes().forEach { process(it) }; flush()
                    }
                    else -> node.childNodes().forEach { process(it) }
                }
            }
        }

        root.childNodes().forEach { process(it) }
        flush()
        return segments
    }

    fun createParagraphFragments(content: Element): List<Paragraph> {
        val paragraphs = mutableListOf<Paragraph>()
        var current = mutableListOf<Fragment>()
        var offset = 0

        fun process(node: org.jsoup.nodes.Node) {
            when (node) {
                is TextNode -> {
                    if (node.text().trim().isNotEmpty()) {
                        val len = node.text().length
                        current += Fragment(offset, offset + len, len, node, false)
                        offset += len
                    }
                }
                is Element -> when (node.tagName().lowercase()) {
                    "p", "div", "section" -> {
                        if (current.isNotEmpty()) {
                            paragraphs += current.toMutableList();
                            current.clear()
                        }
                        node.childNodes().forEach { process(it) }
                        if (current.isNotEmpty()) {
                            paragraphs += current.toMutableList();
                            current.clear()
                        }
                    }
                    else -> node.childNodes().forEach { process(it) }
                }
            }
        }

        process(content)
        if (current.isNotEmpty()) paragraphs += current
        return paragraphs
    }

    /**
     * Apply JPDB tokens to a list of fragments. This creates <span> and <ruby>
     * wrappers similar to the frontend implementation. Only minimal behaviour is
     * included here for brevity.
     */
    fun applyTokens(fragments: Paragraph, tokens: List<Token>) {
        var fragIdx = 0
        var curOffset = 0
        var frag = fragments.getOrNull(fragIdx) ?: return

        for (token in tokens) {
            while (curOffset < token.start) {
                if (frag.end > token.start) {
                    // split
                    val splitPos = token.start - frag.start
                    val newNode = frag.node.splitText(splitPos)
                    val newFrag = Fragment(token.start, frag.end, frag.end - token.start, newNode, frag.hasRuby)
                    fragments.add(fragIdx + 1, newFrag)
                    frag.end = token.start
                    frag.length = frag.end - frag.start
                }
                // mark as unparsed
                frag.node.wrap("<span class='jpdb-word unparsed'></span>")
                curOffset += frag.length
                fragIdx += 1
                frag = fragments.getOrNull(fragIdx) ?: return
            }
            while (curOffset < token.end) {
                if (frag.end > token.end) {
                    val splitPos = token.end - frag.start
                    val newNode = frag.node.splitText(splitPos)
                    val newFrag = Fragment(token.end, frag.end, frag.end - token.end, newNode, frag.hasRuby)
                    fragments.add(fragIdx + 1, newFrag)
                    frag.end = token.end
                    frag.length = frag.end - frag.start
                }

                val wrapperTag = if (token.rubies.isNotEmpty() && !frag.hasRuby) "ruby" else "span"
                val wrapper = frag.node.wrap("<$wrapperTag class='jpdb-word'></$wrapperTag>").parent()!!
                wrapper.addClass(token.card.state.joinToString(" "))
                curOffset = frag.end
                fragIdx += 1
                frag = fragments.getOrNull(fragIdx) ?: break
            }
        }
        for (i in fragIdx until fragments.size) {
            fragments[i].node.wrap("<span class='jpdb-word unparsed'></span>")
        }
    }
}

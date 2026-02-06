package com.progressivereader.kmp.reader

import com.progressivereader.kmp.jpdb.JpdbService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode
import org.jsoup.parser.Tag

data class JpdbHighlightResult(
    val html: String,
    val tokenById: Map<String, JpdbService.ProcessedToken>,
)

class JpdbHighlighter(
    private val tokenCache: JpdbTokenCache,
    private val jpdbService: JpdbService,
) {
    private data class Fragment(
        var start: Int,
        var end: Int,
        val node: TextNode,
    ) {
        val length: Int get() = end - start
    }

    private enum class Category {
        TEXT,
        INLINE,
        BLOCK,
        RUBY,
        NONE,
    }

    suspend fun highlightChapter(
        bodyHtml: String,
        chapterIndex: Int,
        sourceHash: String,
        jpdbApiKey: String,
        isOnline: Boolean,
    ): JpdbHighlightResult? =
        withContext(Dispatchers.Default) {
            val cached = tokenCache.loadIfValid(chapterIndex, sourceHash)
            val tokensFromCache =
                cached?.tokens?.map { cachedToken ->
                    cachedToken.id to JpdbTokenCache.toProcessedToken(cachedToken)
                }

            val (tokenById, tokens) =
                if (tokensFromCache != null) {
                    val map = tokensFromCache.toMap()
                    map to map.values.toList()
                } else {
                    if (!isOnline) return@withContext null
                    val key = jpdbApiKey.trim()
                    if (key.isBlank()) return@withContext null

                    val doc = Jsoup.parseBodyFragment(bodyHtml)
                    val segments = extractTextSegments(doc.body())
                    val fetched = jpdbService.getJpdbData(segments, key) ?: return@withContext null

                    val cachedTokens = fetched.map { JpdbTokenCache.toCachedToken(it) }
                    tokenCache.save(
                        chapterIndex,
                        JpdbTokenCacheFile(
                            createdAt = TranslationCache.isoNowUtc(),
                            sourceHash = sourceHash,
                            tokens = cachedTokens,
                        ),
                    )

                    val map = cachedTokens.associate { it.id to JpdbTokenCache.toProcessedToken(it) }
                    map to map.values.toList()
                }

            val doc = Jsoup.parseBodyFragment(bodyHtml)
            val fragments = buildFragments(doc.body())
            applyTokens(fragments, tokens)
            JpdbHighlightResult(html = doc.body().html(), tokenById = tokenById)
        }

    private fun extractTextSegments(body: Element): List<String> {
        val MAX_SEGMENT_CHARS = 3000
        val segments = mutableListOf<String>()
        var current = StringBuilder()

        fun pushCurrentIfAny() {
            if (current.isEmpty()) return
            val s = current.toString()
            if (s.length <= MAX_SEGMENT_CHARS) {
                segments.add(s)
            } else {
                var start = 0
                while (start < s.length) {
                    val end = minOf(s.length, start + MAX_SEGMENT_CHARS)
                    segments.add(s.substring(start, end))
                    start = end
                }
            }
            current = StringBuilder()
        }

        fun appendText(text: String) {
            if (text.isEmpty()) return
            var remaining = text
            while (remaining.isNotEmpty()) {
                val spaceLeft = MAX_SEGMENT_CHARS - current.length
                if (spaceLeft <= 0) {
                    pushCurrentIfAny()
                    continue
                }
                if (remaining.length <= spaceLeft) {
                    current.append(remaining)
                    break
                } else {
                    current.append(remaining.substring(0, spaceLeft))
                    pushCurrentIfAny()
                    remaining = remaining.substring(spaceLeft)
                }
            }
        }

        fun process(node: Node) {
            when (category(node)) {
                Category.TEXT -> {
                    val text = (node as TextNode).text().replace('\u00A0', ' ')
                    if (text.trim().isNotEmpty()) appendText(text)
                }

                Category.INLINE, Category.RUBY -> node.childNodes().forEach(::process)

                Category.BLOCK -> {
                    pushCurrentIfAny()
                    node.childNodes().forEach(::process)
                    pushCurrentIfAny()
                }

                Category.NONE -> Unit
            }
        }

        process(body)
        pushCurrentIfAny()
        return segments
    }

    private fun buildFragments(body: Element): MutableList<Fragment> {
        val fragments = mutableListOf<Fragment>()
        var globalOffset = 0

        fun process(node: Node) {
            when (category(node)) {
                Category.TEXT -> {
                    val n = node as TextNode
                    val text = n.text().replace('\u00A0', ' ')
                    if (text.trim().isEmpty()) return
                    if (text != n.text()) n.text(text)
                    val start = globalOffset
                    val end = globalOffset + text.length
                    fragments.add(Fragment(start = start, end = end, node = n))
                    globalOffset = end
                }

                Category.INLINE, Category.RUBY, Category.BLOCK -> node.childNodes().forEach(::process)
                Category.NONE -> Unit
            }
        }

        process(body)
        return fragments.filter { it.length > 0 }.toMutableList()
    }

    private fun applyTokens(
        fragments: MutableList<Fragment>,
        tokens: List<JpdbService.ProcessedToken>,
    ) {
        if (fragments.isEmpty() || tokens.isEmpty()) return

        val sortedTokens = tokens.sortedBy { it.start }

        var fragmentIndex = 0
        var curOffset = 0
        var fragment: Fragment? = fragments.getOrNull(fragmentIndex)

        for (token in sortedTokens) {
            if (fragment == null) return
            if (token.end <= token.start) continue

            while (fragment != null && curOffset < token.start) {
                if (fragment.end > token.start) {
                    splitFragment(fragments, fragmentIndex, token.start)
                    fragment = fragments[fragmentIndex]
                }
                curOffset += fragment.length
                fragmentIndex++
                fragment = fragments.getOrNull(fragmentIndex)
            }

            while (fragment != null && curOffset < token.end) {
                if (fragment.end > token.end) {
                    splitFragment(fragments, fragmentIndex, token.end)
                    fragment = fragments[fragmentIndex]
                }

                val tid = JpdbTokenCache.tokenId(token)
                if (!hasAncestorTag(fragment.node, "a")) {
                    val wrapper = buildTokenWrapper(token = token, tid = tid)
                    wrap(fragment.node, wrapper)
                }

                curOffset += fragment.length
                fragmentIndex++
                fragment = fragments.getOrNull(fragmentIndex)
            }
        }
    }

    private fun splitFragment(fragments: MutableList<Fragment>, fragmentIndex: Int, splitOffset: Int) {
        val old = fragments[fragmentIndex]
        if (splitOffset <= old.start || splitOffset >= old.end) return

        val newNode = old.node.splitText(splitOffset - old.start)
        val newFragment = Fragment(start = splitOffset, end = old.end, node = newNode)
        old.end = splitOffset
        fragments.add(fragmentIndex + 1, newFragment)
    }

    private fun buildTokenWrapper(token: JpdbService.ProcessedToken, tid: String): Element {
        val wrapper = Element(Tag.valueOf("a"), "")
        wrapper.attr("href", "pr://jpdb?tid=$tid")
        wrapper.addClass("jpdb-word")

        val states = readStateClasses(token)
        if (states.isEmpty()) {
            wrapper.addClass("not-in-deck")
        } else {
            states.forEach { wrapper.addClass(it) }
        }

        return wrapper
    }

    private fun readStateClasses(token: JpdbService.ProcessedToken): List<String> {
        val stateEl = token.card["state"] ?: return emptyList()

        fun content(el: JsonElement): String? =
            (el as? JsonPrimitive)?.content?.takeIf { it.isNotBlank() }

        return when (stateEl) {
            is JsonArray -> stateEl.mapNotNull { content(it) }
            else -> listOfNotNull(content(stateEl))
        }
    }

    private fun wrap(node: TextNode, wrapper: Element) {
        node.replaceWith(wrapper)
        wrapper.appendChild(node)
    }

    private fun hasAncestorTag(node: TextNode, tag: String): Boolean {
        var p: Node? = node.parent()
        while (p is Element) {
            if (p.tagName().equals(tag, ignoreCase = true)) return true
            p = p.parent()
        }
        return false
    }

    private fun category(node: Node): Category =
        when (node) {
            is TextNode -> Category.TEXT
            is Element -> {
                // Ignore translation overlay nodes so JPDB offsets map to the original text.
                if (node.hasClass("pr-translation") || node.hasAttr("data-pr-translation")) {
                    Category.NONE
                } else {
                    val name = node.tagName().lowercase()
                    when {
                        name == "rt" || name == "rp" -> Category.NONE
                        name == "ruby" -> Category.RUBY
                        name == "br" -> Category.BLOCK
                        isBlockTag(name) -> Category.BLOCK
                        else -> Category.INLINE
                    }
                }
            }

            else -> Category.NONE
        }

    private fun isBlockTag(name: String): Boolean =
        name in
            setOf(
                "p",
                "div",
                "section",
                "article",
                "header",
                "footer",
                "aside",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "ul",
                "ol",
                "li",
                "table",
                "thead",
                "tbody",
                "tfoot",
                "tr",
                "td",
                "th",
                "blockquote",
                "pre",
                "hr",
            )
}

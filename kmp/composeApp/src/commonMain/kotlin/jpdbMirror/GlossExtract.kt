package com.progressivereader.kmp.jpdbMirror

private val ARTICLE_PREFIXES = listOf("a ", "an ", "the ")

// For gloss indexing we keep this set small and focused.
// Swap-time stopwords are broader and live in the swap module.
private val PHRASE_STOPWORDS: Set<String> =
    setOf(
        "a",
        "an",
        "the",
        "of",
        "to",
        "and",
        "or",
        "in",
        "on",
        "at",
        "for",
        "with",
        "from",
        "by",
        "about",
        "into",
        "over",
        "under",
        "after",
        "before",
    )

private val PARENS_RE = Regex("\\([^)]*\\)")
private val WS_RE = Regex("\\s+")
private val VALID_WORD_RE = Regex("^[a-z][a-z'-]+$")

private fun normalizeWhitespace(s: String): String = s.replace(WS_RE, " ").trim()

private fun stripParens(s: String): String = s.replace(PARENS_RE, " ")

private fun stripLeadingArticles(s: String): String {
    for (p in ARTICLE_PREFIXES) {
        if (s.startsWith(p)) return s.substring(p.length)
    }
    return s
}

private fun looksVerbLike(s: String): Boolean = s.startsWith("to ") || s.startsWith("to-")

private fun isValidWord(w: String): Boolean = VALID_WORD_RE.matches(w)

private fun isValidPhraseWords(words: List<String>): Boolean {
    if (words.isEmpty() || words.size > 3) return false
    for (w in words) {
        if (!isValidWord(w)) return false
        if (PHRASE_STOPWORDS.contains(w)) return false
    }
    return true
}

fun extractEnglishNounGlosses(meanings: List<String>): List<String> {
    val out = mutableListOf<String>()
    val seen = HashSet<String>()

    for (meaning in meanings) {
        // Remove parenthetical notes, then split on common separators.
        val cleaned = stripParens(meaning).replace('_', ' ')
        val parts = cleaned.split(';', '/', ',')

        for (raw in parts) {
            var seg = normalizeWhitespace(raw.lowercase())
            if (seg.isBlank()) continue

            if (looksVerbLike(seg)) continue
            seg = stripLeadingArticles(seg)
            seg = normalizeWhitespace(seg)
            if (seg.isBlank()) continue

            val words = seg.split(' ').filter { it.isNotBlank() }
            if (!isValidPhraseWords(words)) continue

            val gloss = words.joinToString(" ")
            if (gloss.length < 2) continue
            if (!seen.add(gloss)) continue
            out.add(gloss)
        }
    }

    return out
}


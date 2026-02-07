package com.progressivereader.kmp.mix

import com.progressivereader.kmp.jpdbMirror.JpdbKnownVocabRecord
import com.progressivereader.kmp.jpdbMirror.JpdbVocabId

// Ported from web: frontend/src/features/reader/utils/englishSwap.ts

private val EN_STOPWORDS: Set<String> =
    setOf(
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "if",
        "then",
        "else",
        "when",
        "while",
        "as",
        "at",
        "by",
        "for",
        "from",
        "in",
        "into",
        "of",
        "on",
        "onto",
        "over",
        "under",
        "to",
        "with",
        "without",
        "about",
        "above",
        "below",
        "between",
        "before",
        "after",
        "during",
        "through",
        "across",
        "around",
        "near",
        "is",
        "am",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "do",
        "does",
        "did",
        "doing",
        "have",
        "has",
        "had",
        "having",
        "can",
        "could",
        "may",
        "might",
        "must",
        "shall",
        "should",
        "will",
        "would",
        "i",
        "me",
        "my",
        "mine",
        "we",
        "us",
        "our",
        "ours",
        "you",
        "your",
        "yours",
        "he",
        "him",
        "his",
        "she",
        "her",
        "hers",
        "it",
        "its",
        "they",
        "them",
        "their",
        "theirs",
        "this",
        "that",
        "these",
        "those",
        "here",
        "there",
        "who",
        "whom",
        "whose",
        "what",
        "which",
        "why",
        "how",
        "not",
        "no",
        "yes",
        "all",
        "any",
        "some",
        "none",
        "each",
        "every",
        "either",
        "neither",
        "both",
        "few",
        "many",
        "much",
        "more",
        "most",
        "less",
        "least",
        "very",
        "just",
        "only",
        "also",
        "even",
        "still",
        "too",
        "so",
        "than",
        "because",
        "since",
        "until",
        "again",
        "once",
        "up",
        "down",
        "out",
        "off",
        "away",
        "back",
    )

private val WORD_RE = Regex("[A-Za-z]+(?:['’\\-][A-Za-z]+)*")

private fun fnv1a32(input: String): Long {
    var hash = 0x811c9dc5L
    for (c in input) {
        hash = hash xor c.code.toLong()
        hash = (hash * 0x01000193L) and 0xFFFFFFFFL
    }
    return hash and 0xFFFFFFFFL
}

private fun stableRand01(input: String): Double = fnv1a32(input).toDouble() / 4294967296.0

private fun normalizePossessive(wordLower: String): Pair<String, Boolean> {
    if (wordLower.endsWith("'s")) return wordLower.dropLast(2) to true
    if (wordLower.endsWith("’s")) return wordLower.dropLast(2) to true
    return wordLower to false
}

private fun singularizeLastWord(wordLower: String): List<String> {
    val out = ArrayList<String>()
    if (wordLower.length < 3) return out
    if (wordLower.endsWith("ies") && wordLower.length > 3) {
        out.add(wordLower.dropLast(3) + "y")
    }
    if (wordLower.endsWith("es") && wordLower.length > 2) {
        out.add(wordLower.dropLast(2))
    }
    if (wordLower.endsWith("s") && wordLower.length > 2) {
        out.add(wordLower.dropLast(1))
    }
    return out
}

private fun isCloseCandidate(a: JpdbKnownVocabRecord, b: JpdbKnownVocabRecord): Boolean {
    val aRank = a.frequencyRank
    val bRank = b.frequencyRank
    if (aRank == null && bRank == null) return true
    if (aRank == null || bRank == null) return false
    return (aRank / 500) == (bRank / 500)
}

private data class WordToken(
    val text: String,
    val lower: String,
    val start: Int,
    val end: Int,
    val hasHyphen: Boolean,
    val isPossessive: Boolean,
    val baseLower: String,
)

private fun tokenizeWords(text: String): List<WordToken> {
    val tokens = ArrayList<WordToken>()
    for (m in WORD_RE.findAll(text)) {
        val raw = m.value
        val lower = raw.lowercase()
        val (base, isPossessive) = normalizePossessive(lower)
        tokens.add(
            WordToken(
                text = raw,
                lower = lower,
                start = m.range.first,
                end = m.range.last + 1,
                hasHyphen = raw.contains('-'),
                isPossessive = isPossessive,
                baseLower = base,
            )
        )
    }
    return tokens
}

private fun shouldBlockWordToken(token: WordToken): Boolean = token.hasHyphen || token.isPossessive

private fun isSwapEligibleGlossKey(glossKey: String): Boolean {
    if (glossKey.isBlank()) return false
    val parts = glossKey.split(' ').filter { it.isNotBlank() }
    if (parts.isEmpty() || parts.size > 3) return false
    for (p in parts) {
        if (EN_STOPWORDS.contains(p)) return false
    }
    return true
}

private fun buildGlossKeyVariants(words: List<WordToken>, startIdx: Int, len: Int): List<String> {
    val slice = words.subList(startIdx, startIdx + len)
    val baseWords = slice.map { it.baseLower }
    val out = ArrayList<String>()
    out.add(baseWords.joinToString(" "))

    val last = baseWords.lastOrNull().orEmpty()
    for (v in singularizeLastWord(last)) {
        val next = baseWords.toMutableList()
        next[next.lastIndex] = v
        out.add(next.joinToString(" "))
    }

    return out
}

private fun pickCandidateForGloss(
    glossKey: String,
    glossIndex: Map<String, List<JpdbVocabId>>,
    vocabById: Map<JpdbVocabId, JpdbKnownVocabRecord>,
    refinedChoices: Map<String, JpdbVocabId?>? = null,
    onAmbiguous: ((String) -> Unit)? = null,
): JpdbKnownVocabRecord? {
    val refined = refinedChoices?.get(glossKey)
    if (refined == null && refinedChoices?.containsKey(glossKey) == true) return null
    if (refined != null) return vocabById[refined]

    val candidateIds = glossIndex[glossKey].orEmpty()
    if (candidateIds.isEmpty()) return null

    val first = vocabById[candidateIds[0]] ?: return null
    if (candidateIds.size >= 2) {
        val second = vocabById[candidateIds[1]]
        if (second != null && isCloseCandidate(first, second)) {
            onAmbiguous?.invoke(glossKey)
            return null
        }
    }
    return first
}

class EnglishSwapHighlighter(
    private val bookId: String,
    private val chapter: Int,
    aggression: Double,
    private val glossIndex: Map<String, List<JpdbVocabId>>,
    private val vocabById: Map<JpdbVocabId, JpdbKnownVocabRecord>,
    private val refinedChoices: Map<String, JpdbVocabId?>? = null,
) {
    private val aggression = aggression.coerceIn(0.0, 1.0)
    private val ambiguousGlosses = LinkedHashSet<String>()
    private var nodeIndex: Int = 0

    fun getAmbiguousGlosses(): List<String> = ambiguousGlosses.toList().sorted()

    fun clearAmbiguousGlosses() {
        ambiguousGlosses.clear()
    }

    fun highlightText(text: String): String {
        val currentNode = nodeIndex
        nodeIndex += 1

        // Fast path: no Latin letters => no swaps.
        if (!text.any { it in 'A'..'Z' || it in 'a'..'z' }) return text

        val words = tokenizeWords(text)
        if (words.isEmpty()) return text

        data class Action(val start: Int, val end: Int, val replacement: String)
        val actions = ArrayList<Action>()

        var i = 0
        var matchOrdinal = 0
        while (i < words.size) {
            val w = words[i]
            if (shouldBlockWordToken(w)) {
                i += 1
                continue
            }

            var matched = false
            for (len in 3 downTo 1) {
                if (i + len > words.size) continue

                val spanStart = words[i].start
                val spanEnd = words[i + len - 1].end

                // Block if any part is blocked.
                var blocked = false
                for (j in i until (i + len)) {
                    if (shouldBlockWordToken(words[j])) {
                        blocked = true
                        break
                    }
                }
                if (blocked) continue

                val variants = buildGlossKeyVariants(words, i, len)
                var chosenKey: String? = null
                var chosen: JpdbKnownVocabRecord? = null
                for (v in variants) {
                    if (!isSwapEligibleGlossKey(v)) continue
                    val record =
                        pickCandidateForGloss(
                            v,
                            glossIndex = glossIndex,
                            vocabById = vocabById,
                            refinedChoices = refinedChoices,
                            onAmbiguous = { k -> ambiguousGlosses.add(k) },
                        )
                    if (record != null) {
                        chosenKey = v
                        chosen = record
                        break
                    }
                }
                if (chosen == null || chosenKey == null) continue

                val seed = "$bookId:$chapter|$currentNode|$matchOrdinal|$chosenKey"
                val r = stableRand01(seed)
                if (r >= aggression) {
                    matchOrdinal += 1
                    i += len
                    matched = true
                    break
                }

                actions.add(Action(start = spanStart, end = spanEnd, replacement = chosen.spelling))
                matchOrdinal += 1
                i += len
                matched = true
                break
            }

            if (!matched) i += 1
        }

        if (actions.isEmpty()) return text
        actions.sortBy { it.start }

        val sb = StringBuilder(text.length)
        var cursor = 0
        for (a in actions) {
            if (a.start < cursor) continue
            sb.append(text.substring(cursor, a.start))
            sb.append(a.replacement)
            cursor = a.end
        }
        sb.append(text.substring(cursor))

        return sb.toString()
    }
}

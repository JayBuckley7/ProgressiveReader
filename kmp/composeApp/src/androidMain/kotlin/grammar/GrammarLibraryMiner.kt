package com.progressivereader.kmp.grammar

import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.CachedBookEntry
import com.progressivereader.kmp.reader.EpubRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup

data class GrammarMinerBudgets(
    val maxBooks: Int = 20,
    val maxChapters: Int = 25,
    val maxCandidates: Int = 25,
    val maxExtractedTextChars: Int = 200_000,
)

private fun clamp01(n: Double): Double = n.coerceIn(0.0, 1.0)

private fun looksJapanese(text: String, minRatio: Double = 0.08, minChars: Int = 40): Boolean {
    val t = text.trim()
    if (t.isBlank()) return false
    val jpRegex = Regex("[\\u3040-\\u30ff\\u3400-\\u9fff]")
    if (t.length < minChars) return jpRegex.containsMatchIn(t)
    val matches = jpRegex.findAll(t).count()
    val ratio = matches.toDouble() / maxOf(1, t.length).toDouble()
    return ratio >= minRatio
}

private fun splitIntoSentences(text: String): List<String> {
    val t = text.replace(Regex("\\s+"), " ").trim()
    if (t.isBlank()) return emptyList()
    val out = ArrayList<String>()
    val sb = StringBuilder()
    for (ch in t) {
        sb.append(ch)
        if (ch == '。' || ch == '！' || ch == '？' || ch == '!' || ch == '?') {
            val s = sb.toString().trim()
            if (s.isNotBlank()) out.add(s)
            sb.setLength(0)
        }
    }
    val tail = sb.toString().trim()
    if (tail.isNotBlank()) out.add(tail)
    return out
}

private fun limitSentencesByPercent(sentences: List<String>, percent: Double): List<String> {
    val p = clamp01(percent)
    if (p >= 1.0) return sentences
    if (sentences.isEmpty()) return emptyList()

    val fullLen = sentences.sumOf { it.length }
    val target = (fullLen * p).toInt()
    if (target <= 0) return sentences.take(1)

    val out = ArrayList<String>()
    var acc = 0
    for (s in sentences) {
        if (out.isEmpty()) {
            out.add(s)
            acc += s.length
            continue
        }
        if (acc + s.length > target) break
        out.add(s)
        acc += s.length
    }
    return if (out.isNotEmpty()) out else sentences.take(1)
}

private fun boundaryAdvances(prev: GrammarScanBoundary?, next: GrammarScanBoundary): Boolean {
    if (prev == null) return true
    if (next.uptoChapter > prev.uptoChapter) return true
    if (next.uptoChapter < prev.uptoChapter) return false
    val prevP = prev.uptoPercent ?: 1.0
    val nextP = next.uptoPercent ?: 1.0
    return nextP > prevP + 1e-6
}

private fun extractPlainTextFromHtml(html: String): String {
    val doc = Jsoup.parseBodyFragment(html).apply { outputSettings().prettyPrint(false) }
    doc.select(".pr-translation, [data-pr-translation], rt, rp, script, style").remove()
    return doc.body().text().replace(Regex("\\s+"), " ").trim()
}

private fun fnv1a32(input: String): Long {
    var hash = 0x811c9dc5L
    for (c in input) {
        hash = hash xor c.code.toLong()
        hash = (hash * 0x01000193L) and 0xFFFFFFFFL
    }
    return hash and 0xFFFFFFFFL
}

private fun stableHashHex(input: String): String = fnv1a32(input).toString(16).padStart(8, '0')

private data class GrammarCandidate(
    val id: String,
    val sentence: String,
    val before: String? = null,
    val after: String? = null,
    val hintSpan: GrammarApiService.Span? = null,
)

private fun buildCandidatesFromSentences(
    sentencesAll: List<String>,
    grammar: GrammarPoint,
    bookId: String,
    chapterIndex: Int,
    maxCandidates: Int,
): List<GrammarCandidate> {
    if (grammar.hintQuality != HintQuality.OK) return emptyList()
    val hints = grammar.hints.map { it.trim() }.filter { it.isNotBlank() }
    if (hints.isEmpty()) return emptyList()

    val out = ArrayList<GrammarCandidate>()
    for (i in sentencesAll.indices) {
        if (out.size >= maxCandidates) break
        val sentence = sentencesAll[i]
        if (sentence.isBlank()) continue

        var hitHint: String? = null
        var hitIndex = -1
        for (h in hints) {
            val idx = sentence.indexOf(h)
            if (idx >= 0) {
                hitHint = h
                hitIndex = idx
                break
            }
        }
        if (hitHint == null || hitIndex < 0) continue

        val before = sentencesAll.getOrNull(i - 1)
        val after = sentencesAll.getOrNull(i + 1)
        out.add(
            GrammarCandidate(
                id = "$bookId:$chapterIndex:$i",
                sentence = sentence.take(300),
                before = before?.take(300),
                after = after?.take(300),
                hintSpan = GrammarApiService.Span(start = hitIndex, end = hitIndex + hitHint.length, text = hitHint),
            )
        )
    }
    return out
}

private fun detectFileType(entry: CachedBookEntry, bookCache: BookCache): String {
    val name = entry.name.lowercase()
    if (name.endsWith(".pdf") || entry.mimeType?.contains("pdf", ignoreCase = true) == true) return "pdf"
    if (name.endsWith(".txt") || entry.mimeType?.startsWith("text/", ignoreCase = true) == true) return "txt"
    return "epub"
}

private suspend fun boundaryForBook(entry: CachedBookEntry, bookCache: BookCache, fileType: String): GrammarScanBoundary {
    val hasState = bookCache.stateFile(entry.id).exists()
    val state =
        try {
            bookCache.loadState(entry.id)
        } catch (_: Throwable) {
            null
        }

    if (fileType == "pdf") {
        // Mining currently skips PDFs.
        return GrammarScanBoundary(uptoChapter = 0, uptoPage = 1)
    }

    if (fileType == "txt") {
        // No chapter/scroll tracking for TXT yet; treat as a single "chapter".
        return GrammarScanBoundary(uptoChapter = 0, uptoPercent = if (hasState) 1.0 else 0.2)
    }

    val uptoChapter = (state?.lastChapterIndex ?: 0).coerceAtLeast(0)
    return GrammarScanBoundary(uptoChapter = uptoChapter, uptoPercent = if (hasState) 1.0 else 0.05)
}

private fun parseIsoSortKey(entry: CachedBookEntry): String {
    // ISO timestamps sort lexicographically (same format across the app).
    return (entry.lastOpenedAt ?: entry.cachedAt ?: entry.modifiedTime ?: "").trim()
}

suspend fun mineLibraryForGrammarExamples(
    grammar: GrammarPoint,
    booksIndex: List<CachedBookEntry>,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    api: GrammarApiService,
    openAiModel: String,
    openAiApiKey: String?,
    alreadyScannedBoundaries: Map<String, GrammarScanBoundary> = emptyMap(),
    budgets: GrammarMinerBudgets = GrammarMinerBudgets(),
    maxExamples: Int = 3,
    onProgress: ((GrammarScanProgress) -> Unit)? = null,
): Pair<List<GrammarExample>, Map<String, GrammarScanBoundary>> {
    val safeMaxExamples = maxExamples.coerceIn(1, 3)

    val supported =
        booksIndex
            .filter { it.id.isNotBlank() }
            .map { entry -> entry to detectFileType(entry, bookCache) }
            .filter { (_, fileType) -> fileType != "pdf" }
            .sortedByDescending { (entry, _) -> parseIsoSortKey(entry) }
            .take(budgets.maxBooks)

    val booksTotal = supported.size
    var booksScanned = 0
    var chaptersScanned = 0
    var extractedChars = 0

    val scannedBoundaries = LinkedHashMap<String, GrammarScanBoundary>()
    val allCandidates = ArrayList<GrammarCandidate>()

    for ((entry, fileType) in supported) {
        withContext(Dispatchers.Default) { ensureActive() }
        if (allCandidates.size >= budgets.maxCandidates) break

        val boundary = boundaryForBook(entry, bookCache, fileType)
        scannedBoundaries[entry.id] = boundary

        val prevBoundary = alreadyScannedBoundaries[entry.id]
        if (!boundaryAdvances(prevBoundary, boundary)) continue

        booksScanned += 1
        onProgress?.invoke(
            GrammarScanProgress(
                booksScanned = booksScanned,
                booksTotal = booksTotal,
                chaptersScanned = chaptersScanned,
            )
        )

        if (fileType == "txt") {
            val txtFile = bookCache.txtFile(entry.id)
            val text =
                withContext(Dispatchers.IO) {
                    if (!txtFile.exists()) return@withContext null
                    runCatching { txtFile.readText(Charsets.UTF_8) }.getOrNull()
                } ?: continue

            if (extractedChars >= budgets.maxExtractedTextChars) break

            val cleaned = text.replace(Regex("\\s+"), " ").trim()
            if (!looksJapanese(cleaned)) continue

            extractedChars += cleaned.length
            chaptersScanned += 1
            onProgress?.invoke(
                GrammarScanProgress(
                    booksScanned = booksScanned,
                    booksTotal = booksTotal,
                    chaptersScanned = chaptersScanned,
                )
            )

            val sentences = splitIntoSentences(cleaned)
            val limited = limitSentencesByPercent(sentences, boundary.uptoPercent ?: 1.0)
            val candidates =
                buildCandidatesFromSentences(
                    sentencesAll = limited,
                    grammar = grammar,
                    bookId = entry.id,
                    chapterIndex = 0,
                    maxCandidates = budgets.maxCandidates - allCandidates.size,
                )
            allCandidates.addAll(candidates)
            continue
        }

        // EPUB
        val epubFile = bookCache.epubFile(entry.id)
        val extractedDir = bookCache.extractedDir(entry.id)
        if (!epubFile.exists()) continue

        try {
            epubRepository.extractIfNeeded(epubFile = epubFile, extractedDir = extractedDir)
        } catch (_: Throwable) {
            // Ignore and try to proceed; loadBook will fail if extraction is incomplete.
        }

        val book =
            try {
                epubRepository.loadBook(extractedDir)
            } catch (_: Throwable) {
                null
            } ?: continue
        val totalChapters = book.chapters.size
        if (totalChapters <= 0) continue

        val lastChapter = boundary.uptoChapter.coerceIn(0, totalChapters - 1)
        for (ch in 0..lastChapter) {
            withContext(Dispatchers.Default) { ensureActive() }
            if (allCandidates.size >= budgets.maxCandidates) break
            if (chaptersScanned >= budgets.maxChapters) break
            if (extractedChars >= budgets.maxExtractedTextChars) break

            val percent = if (ch < lastChapter) 1.0 else (boundary.uptoPercent ?: 1.0)

            val chapter = book.chapters.getOrNull(ch) ?: continue
            val sanitized = epubRepository.loadSanitizedChapterHtml(extractedDir, chapter.href) ?: continue
            val text = extractPlainTextFromHtml(sanitized.bodyHtml)
            if (!looksJapanese(text)) continue

            chaptersScanned += 1
            extractedChars += text.length
            onProgress?.invoke(
                GrammarScanProgress(
                    booksScanned = booksScanned,
                    booksTotal = booksTotal,
                    chaptersScanned = chaptersScanned,
                )
            )

            val sentences = splitIntoSentences(text)
            val limited = limitSentencesByPercent(sentences, percent)
            val candidates =
                buildCandidatesFromSentences(
                    sentencesAll = limited,
                    grammar = grammar,
                    bookId = entry.id,
                    chapterIndex = ch,
                    maxCandidates = budgets.maxCandidates - allCandidates.size,
                )
            allCandidates.addAll(candidates)
        }
    }

    if (allCandidates.isEmpty()) return emptyList<GrammarExample>() to scannedBoundaries

    val validateReq =
        GrammarApiService.ValidateExamplesRequest(
            grammar =
                GrammarApiService.GrammarInfo(
                    id = grammar.id,
                    title = grammar.title,
                    meaning = grammar.meaning,
                    level = grammar.level.id,
                ),
            candidates =
                allCandidates.map {
                    GrammarApiService.GrammarValidateCandidate(
                        id = it.id,
                        sentence = it.sentence,
                        before = it.before,
                        after = it.after,
                        hintSpan = it.hintSpan,
                    )
                },
            maxResults = safeMaxExamples,
            model = openAiModel.trim().ifBlank { "gpt-4o-mini" },
            apiKey = openAiApiKey?.trim()?.takeIf { it.isNotBlank() },
        )

    val resp =
        try {
            api.validateExamples(validateReq)
        } catch (err: Throwable) {
            // Fallback: if OpenAI isn't configured, surface naive hint matches so the UI isn't empty.
            val msg = err.message.orEmpty()
            if (msg.contains("OpenAI API key", ignoreCase = true)) {
                val now = GrammarMiningStore.isoNowUtc()
                val naive =
                    allCandidates.take(safeMaxExamples).map { c ->
                        val span = c.hintSpan ?: GrammarApiService.Span(0, 0, "")
                        val start = span.start.coerceIn(0, c.sentence.length)
                        val end = span.end.coerceIn(start, c.sentence.length)
                        val text = (span.text ?: c.sentence.substring(start, end)).ifBlank { c.sentence.substring(start, end) }
                        val idSeed = "${grammar.id}|${c.id}|${c.sentence}|$start|$end"
                        val id = stableHashHex(idSeed)
                        GrammarExample(
                            id = id,
                            grammarId = grammar.id,
                            grammarTitle = grammar.title,
                            grammarMeaning = grammar.meaning,
                            grammarLevel = grammar.level.id,
                            bookId = c.id.split(":").getOrNull(0).orEmpty(),
                            chapterIndex = c.id.split(":").getOrNull(1)?.toIntOrNull() ?: 0,
                            sentence = c.sentence,
                            before = c.before,
                            after = c.after,
                            match = GrammarExampleMatchSpan(start = start, end = end, text = text),
                            confidence = 0.35,
                            createdAt = now,
                        )
                    }
                return naive to scannedBoundaries
            }
            throw err
        }

    val byId = allCandidates.associateBy { it.id }
    val now = GrammarMiningStore.isoNowUtc()
    val examples = ArrayList<GrammarExample>()

    for (m in resp.matches) {
        if (examples.size >= safeMaxExamples) break
        if (!m.isMatch) continue
        val cand = byId[m.candidateId] ?: continue
        val span = m.matchSpan ?: continue
        val sentence = cand.sentence
        val start = span.start.coerceIn(0, sentence.length)
        val end = span.end.coerceIn(start, sentence.length)
        val text = (span.text ?: sentence.substring(start, end)).ifBlank { sentence.substring(start, end) }

        val idSeed = "${grammar.id}|${cand.id}|$sentence|$start|$end"
        val id = stableHashHex(idSeed)

        val parts = cand.id.split(":")
        val bookId = parts.getOrNull(0).orEmpty()
        val chapterIndex = parts.getOrNull(1)?.toIntOrNull() ?: 0

        examples.add(
            GrammarExample(
                id = id,
                grammarId = grammar.id,
                grammarTitle = grammar.title,
                grammarMeaning = grammar.meaning,
                grammarLevel = grammar.level.id,
                bookId = bookId,
                chapterIndex = chapterIndex,
                sentence = sentence,
                before = cand.before,
                after = cand.after,
                match = GrammarExampleMatchSpan(start = start, end = end, text = text),
                explanation = m.explanation,
                confidence = (m.confidence ?: 0.6).coerceIn(0.0, 1.0),
                createdAt = now,
            )
        )
    }

    return examples to scannedBoundaries
}

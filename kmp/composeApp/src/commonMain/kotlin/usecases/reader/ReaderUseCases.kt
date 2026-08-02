package com.progressivereader.kmp.usecases.reader

import com.progressivereader.kmp.domain.reader.BookFormat
import com.progressivereader.kmp.domain.reader.BookState
import com.progressivereader.kmp.domain.reader.ChapterContent
import com.progressivereader.kmp.domain.reader.TranslationCacheEntry
import com.progressivereader.kmp.domain.reader.isReflowable
import com.progressivereader.kmp.jpdb.JpdbService
import com.progressivereader.kmp.jpdbMirror.JpdbKnownVocabRecord
import com.progressivereader.kmp.jpdbMirror.JpdbVocabId
import com.progressivereader.kmp.mix.EnglishSwapHighlighter
import com.progressivereader.kmp.mix.MixRefineCandidate
import com.progressivereader.kmp.mix.getMixRefineCacheKey
import com.progressivereader.kmp.ports.AiPort
import com.progressivereader.kmp.ports.CryptoPort
import com.progressivereader.kmp.ports.GrammarPort
import com.progressivereader.kmp.ports.GrammarUnderlinePort
import com.progressivereader.kmp.ports.JpdbActionsPort
import com.progressivereader.kmp.ports.JpdbHighlightPort
import com.progressivereader.kmp.ports.JpdbHighlightResult
import com.progressivereader.kmp.ports.JpdbMirrorPort
import com.progressivereader.kmp.ports.JpdbReviewCardResult
import com.progressivereader.kmp.ports.JpdbUpdateWordStateResult
import com.progressivereader.kmp.ports.MixApplyPort
import com.progressivereader.kmp.ports.MixRefinePort
import com.progressivereader.kmp.ports.ReaderPort
import com.progressivereader.kmp.ports.TimePort
import com.progressivereader.kmp.ports.TranslationCachePort
import com.progressivereader.kmp.ports.TranslationPort
import com.progressivereader.kmp.reader.EpubBook
import kotlinx.coroutines.flow.Flow

data class OpenBookResult(
    val bookId: String,
    val title: String,
    val format: BookFormat,
    val epubBook: EpubBook? = null,
)

class OpenBookUseCase(
    private val readerPort: ReaderPort,
) {
    suspend operator fun invoke(bookId: String): OpenBookResult? {
        val format = readerPort.detectCachedFormat(bookId) ?: return null
        val title =
            readerPort.resolveTitle(bookId)
                ?: when (format) {
                    BookFormat.PDF -> "PDF"
                    BookFormat.TXT -> "TXT"
                    BookFormat.EPUB -> "Reader"
                    BookFormat.MOBI -> "MOBI"
                }
        val epubBook =
            if (format.isReflowable()) {
                readerPort.openReflowableBook(bookId, format)
            } else {
                null
            }
        if (format.isReflowable() && epubBook == null) return null
        return OpenBookResult(bookId = bookId, title = title, format = format, epubBook = epubBook)
    }
}

class MarkBookOpenedUseCase(
    private val readerPort: ReaderPort,
) {
    suspend operator fun invoke(bookId: String) {
        readerPort.markOpened(bookId)
    }
}

class LoadBookStateUseCase(
    private val readerPort: ReaderPort,
) {
    suspend operator fun invoke(bookId: String): BookState = readerPort.loadBookState(bookId)
}

class SaveBookStateUseCase(
    private val readerPort: ReaderPort,
) {
    suspend operator fun invoke(
        bookId: String,
        state: BookState,
    ) {
        readerPort.saveBookState(bookId, state)
    }
}

class LoadChapterContentUseCase(
    private val readerPort: ReaderPort,
) {
    suspend operator fun invoke(
        bookId: String,
        chapterHref: String,
    ): ChapterContent? = readerPort.loadChapterContent(bookId = bookId, chapterHref = chapterHref)
}

data class TranslatedChapterResult(
    val html: String,
    val htmlHash: String,
    val fromCache: Boolean,
)

class LoadCachedTranslationUseCase(
    private val translationCachePort: TranslationCachePort,
    private val cryptoPort: CryptoPort,
) {
    suspend operator fun invoke(
        bookId: String,
        chapterIndex: Int,
        sourceHash: String,
        targetLang: String,
        useCefr: Boolean,
        cefrLevel: String,
    ): TranslatedChapterResult? {
        val entry =
            translationCachePort.loadIfValid(
                bookId = bookId,
                chapterIndex = chapterIndex,
                sourceHash = sourceHash,
                targetLang = targetLang,
                useCefr = useCefr,
                cefrLevel = cefrLevel,
            ) ?: return null
        val hash = cryptoPort.sha256Hex(entry.html)
        return TranslatedChapterResult(html = entry.html, htmlHash = hash, fromCache = true)
    }
}

class TranslateChapterUseCase(
    private val translationPort: TranslationPort,
    private val translationCachePort: TranslationCachePort,
    private val timePort: TimePort,
    private val cryptoPort: CryptoPort,
) {
    suspend operator fun invoke(
        bookId: String,
        chapterIndex: Int,
        content: String,
        sourceHash: String,
        targetLang: String,
        model: String,
        apiKey: String?,
        useCefr: Boolean,
        cefrLevel: String,
        cacheEnabled: Boolean,
    ): TranslatedChapterResult? {
        val html =
            translationPort.translateChapterToHtml(
                content = content,
                targetLang = targetLang,
                model = model,
                apiKey = apiKey,
                useCefr = useCefr,
                cefrLevel = cefrLevel,
            ) ?: return null

        val entry =
            TranslationCacheEntry(
                createdAt = timePort.nowIsoUtc(),
                targetLang = targetLang,
                useCefr = useCefr,
                cefrLevel = cefrLevel,
                sourceHash = sourceHash,
                html = html,
            )
        if (cacheEnabled) {
            runCatching { translationCachePort.save(bookId = bookId, chapterIndex = chapterIndex, entry = entry) }
        }

        return TranslatedChapterResult(
            html = html,
            htmlHash = cryptoPort.sha256Hex(html),
            fromCache = false,
        )
    }
}

data class MixAppliedResult(
    val html: String,
    val sourceHash: String,
    val ambiguousGlosses: List<String>,
)

class ApplyMixUseCase(
    private val mixApplyPort: MixApplyPort,
    private val cryptoPort: CryptoPort,
) {
    suspend operator fun invoke(
        bookId: String,
        chapterIndex: Int,
        bodyHtml: String,
        aggression: Float,
        glossIndex: Map<String, List<JpdbVocabId>>,
        vocabById: Map<JpdbVocabId, JpdbKnownVocabRecord>,
        refinedChoices: Map<String, JpdbVocabId?>,
    ): MixAppliedResult {
        val highlighter =
            EnglishSwapHighlighter(
                bookId = bookId,
                chapter = chapterIndex,
                aggression = aggression.toDouble(),
                glossIndex = glossIndex,
                vocabById = vocabById,
                refinedChoices = refinedChoices,
            )
        val swapped = mixApplyPort.applyMixSwaps(bodyHtml = bodyHtml, highlighter = highlighter)
        return MixAppliedResult(
            html = swapped,
            sourceHash = cryptoPort.sha256Hex(swapped),
            ambiguousGlosses = highlighter.getAmbiguousGlosses(),
        )
    }
}

data class MixRefineOutcome(
    val choices: Map<String, String?>,
    val fromCache: Boolean,
)

class RefineMixUseCase(
    private val mixRefinePort: MixRefinePort,
    private val aiPort: AiPort,
) {
    suspend operator fun invoke(
        bookId: String,
        chapterIndex: Int,
        model: String,
        openAiApiKey: String,
        textSample: String,
        ambiguousKeys: List<String>,
        candidatesByKey: Map<String, List<MixRefineCandidate>>,
    ): MixRefineOutcome? {
        val keys =
            ambiguousKeys.map { it.trim() }
                .filter { it.isNotBlank() }
                .distinct()
                .take(30)
        if (keys.isEmpty()) return MixRefineOutcome(choices = emptyMap(), fromCache = true)

        val idsByKey =
            candidatesByKey.mapValues { (_, v) -> v.map { it.id }.filter { it.isNotBlank() } }

        val cacheKey =
            getMixRefineCacheKey(
                bookId = bookId,
                chapter = chapterIndex,
                model = model,
                textSample = textSample,
                ambiguousKeys = keys,
                candidatesByKey = idsByKey,
            )

        val cached = runCatching { mixRefinePort.loadChoices(bookId = bookId, cacheKey = cacheKey) }.getOrNull()
        if (cached != null) {
            runCatching { mixRefinePort.setLatest(bookId = bookId, chapterIndex = chapterIndex, cacheKey = cacheKey) }
            return MixRefineOutcome(choices = cached, fromCache = true)
        }

        val choices =
            aiPort.refineAmbiguousMixSwaps(
                openAiKey = openAiApiKey,
                model = model,
                textSample = textSample,
                ambiguousKeys = keys,
                candidatesByKey = candidatesByKey,
            )

        runCatching { mixRefinePort.saveChoices(bookId = bookId, cacheKey = cacheKey, choices = choices) }
        runCatching { mixRefinePort.setLatest(bookId = bookId, chapterIndex = chapterIndex, cacheKey = cacheKey) }

        return MixRefineOutcome(choices = choices, fromCache = false)
    }
}

class LoadLatestMixChoicesUseCase(
    private val mixRefinePort: MixRefinePort,
) {
    suspend operator fun invoke(
        bookId: String,
        chapterIndex: Int,
    ): Map<String, String?> =
        runCatching { mixRefinePort.loadLatestChoices(bookId = bookId, chapterIndex = chapterIndex) }
            .getOrDefault(emptyMap())
}

class ClearLatestMixChoicesUseCase(
    private val mixRefinePort: MixRefinePort,
) {
    suspend operator fun invoke(
        bookId: String,
        chapterIndex: Int,
    ) {
        mixRefinePort.clearLatest(bookId = bookId, chapterIndex = chapterIndex)
    }
}

class LoadJpdbMirrorSnapshotUseCase(
    private val jpdbMirrorPort: JpdbMirrorPort,
) {
    suspend operator fun invoke() = jpdbMirrorPort.loadSnapshot()
}

class HighlightChapterUseCase(
    private val jpdbHighlightPort: JpdbHighlightPort,
) {
    suspend operator fun invoke(
        bookId: String,
        bodyHtml: String,
        chapterIndex: Int,
        sourceHash: String,
        jpdbApiKey: String,
        isOnline: Boolean,
    ): JpdbHighlightResult? =
        jpdbHighlightPort.highlightChapter(
            bookId = bookId,
            bodyHtml = bodyHtml,
            chapterIndex = chapterIndex,
            sourceHash = sourceHash,
            jpdbApiKey = jpdbApiKey,
            isOnline = isOnline,
        )
}

class UpdateCachedTokenStateUseCase(
    private val jpdbHighlightPort: JpdbHighlightPort,
) {
    suspend operator fun invoke(
        bookId: String,
        chapterIndex: Int,
        sourceHash: String,
        tokenId: String,
        tokenById: Map<String, JpdbService.ProcessedToken>,
        nextState: List<String>,
    ): Boolean =
        jpdbHighlightPort.updateCachedTokenState(
            bookId = bookId,
            chapterIndex = chapterIndex,
            sourceHash = sourceHash,
            tokenId = tokenId,
            tokenById = tokenById,
            nextState = nextState,
        )
}

class ObserveGrammarStateUseCase(
    private val grammarPort: GrammarPort,
) {
    operator fun invoke(): Flow<com.progressivereader.kmp.grammar.GrammarState> = grammarPort.stateFlow
}

class UnderlineGrammarUseCase(
    private val grammarUnderlinePort: GrammarUnderlinePort,
) {
    suspend operator fun invoke(
        highlightedBodyHtml: String,
        tokenById: Map<String, JpdbService.ProcessedToken>,
        learningPoints: List<com.progressivereader.kmp.grammar.GrammarPoint>,
    ): String =
        grammarUnderlinePort.underline(
            highlightedBodyHtml = highlightedBodyHtml,
            tokenById = tokenById,
            learningPoints = learningPoints,
        )
}

class MineWordUseCase(
    private val jpdbActionsPort: JpdbActionsPort,
) {
    suspend operator fun invoke(
        vid: Int,
        sid: Int,
        jpdbApiKey: String,
        miningDeckId: Int? = null,
    ): Boolean = jpdbActionsPort.mineWord(vid = vid, sid = sid, jpdbApiKey = jpdbApiKey, miningDeckId = miningDeckId)
}

class UpdateWordStateUseCase(
    private val jpdbActionsPort: JpdbActionsPort,
) {
    suspend operator fun invoke(
        vid: Int,
        sid: Int,
        flag: String,
        state: Boolean,
        jpdbApiKey: String,
    ): JpdbUpdateWordStateResult? =
        jpdbActionsPort.updateWordState(
            vid = vid,
            sid = sid,
            flag = flag,
            state = state,
            jpdbApiKey = jpdbApiKey,
        )
}

class ReviewCardUseCase(
    private val jpdbActionsPort: JpdbActionsPort,
) {
    suspend operator fun invoke(
        vid: Int,
        sid: Int,
        rating: String,
        jpdbApiKey: String,
    ): JpdbReviewCardResult? =
        jpdbActionsPort.reviewCard(
            vid = vid,
            sid = sid,
            rating = rating,
            jpdbApiKey = jpdbApiKey,
        )
}

class NowIsoUtcUseCase(
    private val timePort: TimePort,
) {
    operator fun invoke(): String = timePort.nowIsoUtc()
}

package com.progressivereader.kmp.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.progressivereader.kmp.domain.reader.BookFormat
import com.progressivereader.kmp.domain.reader.BookState
import com.progressivereader.kmp.domain.reader.Bookmark
import com.progressivereader.kmp.grammar.GrammarPoint
import com.progressivereader.kmp.grammar.HintQuality
import com.progressivereader.kmp.grammar.getGrammarPointById
import com.progressivereader.kmp.jpdb.JpdbService
import com.progressivereader.kmp.jpdbMirror.JpdbKnownVocabRecord
import com.progressivereader.kmp.jpdbMirror.JpdbMirrorSnapshot
import com.progressivereader.kmp.jpdbMirror.JpdbVocabId
import com.progressivereader.kmp.jpdbMirror.normalizeCardState
import com.progressivereader.kmp.mix.MixRefineCandidate
import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.settings.ReaderSettings
import com.progressivereader.kmp.usecases.reader.ApplyMixUseCase
import com.progressivereader.kmp.usecases.reader.ClearLatestMixChoicesUseCase
import com.progressivereader.kmp.usecases.reader.HighlightChapterUseCase
import com.progressivereader.kmp.usecases.reader.LoadBookStateUseCase
import com.progressivereader.kmp.usecases.reader.LoadCachedTranslationUseCase
import com.progressivereader.kmp.usecases.reader.LoadChapterContentUseCase
import com.progressivereader.kmp.usecases.reader.LoadJpdbMirrorSnapshotUseCase
import com.progressivereader.kmp.usecases.reader.LoadLatestMixChoicesUseCase
import com.progressivereader.kmp.usecases.reader.MarkBookOpenedUseCase
import com.progressivereader.kmp.usecases.reader.MineWordUseCase
import com.progressivereader.kmp.usecases.reader.NowIsoUtcUseCase
import com.progressivereader.kmp.usecases.reader.OpenBookUseCase
import com.progressivereader.kmp.usecases.reader.ObserveGrammarStateUseCase
import com.progressivereader.kmp.usecases.reader.RefineMixUseCase
import com.progressivereader.kmp.usecases.reader.ReviewCardUseCase
import com.progressivereader.kmp.usecases.reader.SaveBookStateUseCase
import com.progressivereader.kmp.usecases.reader.TranslateChapterUseCase
import com.progressivereader.kmp.usecases.reader.UnderlineGrammarUseCase
import com.progressivereader.kmp.usecases.reader.UpdateCachedTokenStateUseCase
import com.progressivereader.kmp.usecases.reader.UpdateWordStateUseCase
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.jsoup.Jsoup
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

data class JpdbMeaningUi(
    val partOfSpeech: String?,
    val glosses: List<String>,
)

data class JpdbCardUi(
    val spelling: String?,
    val reading: String?,
    val meanings: List<JpdbMeaningUi>,
)

data class JpdbTokenUi(
    val id: String,
    val vid: Int?,
    val sid: Int?,
    val state: Set<String>,
    val card: JpdbCardUi,
)

data class ReaderUiState(
    val bookId: String? = null,
    val isOnline: Boolean = true,
    val sessionJwt: String? = null,

    // Reader settings surfaced to UI.
    val theme: String = ReaderSettings().theme,
    val fontSizeSp: Float = ReaderSettings().fontSizeSp,
    val ttsRate: Float = ReaderSettings().ttsRate,
    val cacheTranslations: Boolean = ReaderSettings().cacheTranslations,
    val translationTargetLang: String = ReaderSettings().translationTargetLang,
    val cefrLevel: String = ReaderSettings().cefrLevel,
    val mixEnabled: Boolean = ReaderSettings().mixEnabled,
    val mixAggression: Float = ReaderSettings().mixAggression,
    val mixAutoEnableHighlight: Boolean = ReaderSettings().mixAutoEnableHighlight,
    val highlightEnabled: Boolean = ReaderSettings().jpdbHighlightEnabled,
    val grammarUnderlinesEnabled: Boolean = true,

    val hasJpdbApiKey: Boolean = false,
    val hasOpenAiApiKey: Boolean = false,

    // Host / open state.
    val isOpening: Boolean = false,
    val title: String = "Reader",
    val format: BookFormat? = null,
    val openError: String? = null,

    // EPUB reader state.
    val epubBook: EpubBook? = null,
    val bookState: BookState = BookState(),
    val chapterIndex: Int = 0,
    val chapterHeadHtml: String = "",
    val chapterBodyHtml: String? = null,
    val chapterBaseUrl: String? = null,
    val chapterSourceHash: String? = null,

    // Mix.
    val mixActive: Boolean = false,
    val isApplyingMix: Boolean = false,
    val mixedBodyHtml: String? = null,
    val mixedSourceHash: String? = null,
    val mixAmbiguousGlosses: List<String> = emptyList(),
    val refinedChoices: Map<String, String?> = emptyMap(),
    val isRefiningMix: Boolean = false,

    // Translation.
    val isTranslated: Boolean = false,
    val isTranslating: Boolean = false,
    val translatedBodyHtml: String? = null,
    val translatedSourceHash: String? = null,

    // Highlights.
    val isApplyingHighlights: Boolean = false,
    val highlightedBodyHtml: String? = null,
    val highlightedSourceHash: String? = null,
    val highlightedForTranslatedMode: Boolean = false,

    // Grammar.
    val grammarMarkedBodyHtml: String? = null,
    val grammarMarkedSourceHash: String? = null,

    // Token UI data (derived from highlight tokens; safe for screens to consume).
    val tokenUiById: Map<String, JpdbTokenUi> = emptyMap(),
    val isJpdbActionBusy: Boolean = false,
)

sealed interface ReaderEventAction {
    data object OpenSettings : ReaderEventAction
}

sealed interface ReaderEvent {
    data class Snackbar(
        val message: String,
        val actionLabel: String? = null,
        val action: ReaderEventAction? = null,
    ) : ReaderEvent

    data class PersistHighlightEnabled(val enabled: Boolean) : ReaderEvent
}

class ReaderViewModel(
    private val openBookUseCase: OpenBookUseCase,
    private val markBookOpenedUseCase: MarkBookOpenedUseCase,
    private val loadBookStateUseCase: LoadBookStateUseCase,
    private val saveBookStateUseCase: SaveBookStateUseCase,
    private val nowIsoUtcUseCase: NowIsoUtcUseCase,
    private val loadChapterContentUseCase: LoadChapterContentUseCase,
    private val loadCachedTranslationUseCase: LoadCachedTranslationUseCase,
    private val translateChapterUseCase: TranslateChapterUseCase,
    private val loadJpdbMirrorSnapshotUseCase: LoadJpdbMirrorSnapshotUseCase,
    private val highlightChapterUseCase: HighlightChapterUseCase,
    private val updateCachedTokenStateUseCase: UpdateCachedTokenStateUseCase,
    private val observeGrammarStateUseCase: ObserveGrammarStateUseCase,
    private val underlineGrammarUseCase: UnderlineGrammarUseCase,
    private val loadLatestMixChoicesUseCase: LoadLatestMixChoicesUseCase,
    private val applyMixUseCase: ApplyMixUseCase,
    private val refineMixUseCase: RefineMixUseCase,
    private val clearLatestMixChoicesUseCase: ClearLatestMixChoicesUseCase,
    private val mineWordUseCase: MineWordUseCase,
    private val updateWordStateUseCase: UpdateWordStateUseCase,
    private val reviewCardUseCase: ReviewCardUseCase,
) : ViewModel() {
    private val _state = MutableStateFlow(ReaderUiState())
    val state: StateFlow<ReaderUiState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<ReaderEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<ReaderEvent> = _events.asSharedFlow()

    private var openJob: Job? = null
    private var chapterJob: Job? = null
    private var mixJob: Job? = null
    private var highlightJob: Job? = null
    private var grammarJob: Job? = null

    // Settings (keep secrets out of state).
    private var jpdbApiKey: String? = null
    private var openAiApiKey: String? = null
    private var openAiModel: String = ReaderSettings().openAiModel

    // Optimistic highlight updates so UI doesn't flicker while settings persistence catches up.
    private var highlightEnabledOverride: Boolean? = null

    // Mirror snapshot data for mix mode.
    private var mirrorSnapshot: JpdbMirrorSnapshot? = null
    private var mixVocabById: Map<JpdbVocabId, JpdbKnownVocabRecord> = emptyMap()
    private var mixGlossIndex: Map<String, List<JpdbVocabId>> = emptyMap()

    // Grammar derived state (screen doesn't need the points list).
    private var learningGrammarPoints: List<GrammarPoint> = emptyList()

    // Highlight tokens (keep raw token maps out of screen; screen receives tokenUiById).
    private var tokenById: Map<String, JpdbService.ProcessedToken> = emptyMap()

    private val highlightErrorShownKeys = HashSet<String>()

    init {
        viewModelScope.launch {
            observeGrammarStateUseCase().collect { gs ->
                _state.update { it.copy(grammarUnderlinesEnabled = gs.underlinesEnabled) }
                learningGrammarPoints =
                    gs.learningIds.mapNotNull { getGrammarPointById(it) }
                        .filter { it.hintQuality == HintQuality.OK && it.hints.isNotEmpty() }
                scheduleGrammarRefresh()
            }
        }

        viewModelScope.launch {
            mirrorSnapshot = runCatching { loadJpdbMirrorSnapshotUseCase() }.getOrNull()
            val snap = mirrorSnapshot
            mixVocabById = snap?.knownVocab?.associateBy { it.id } ?: emptyMap()
            mixGlossIndex = snap?.glossIndexRows?.associate { it.gloss to it.candidateIds } ?: emptyMap()
            scheduleMixRefresh()
        }
    }

    fun updateEnvironment(
        isOnline: Boolean,
        sessionJwt: String?,
        settings: ReaderSettings,
    ) {
        val normalizedJwt = sessionJwt?.trim()?.takeIf { it.isNotBlank() }
        val normalizedJpdbKey = settings.jpdbApiKey?.trim()?.takeIf { it.isNotBlank() }
        val normalizedOpenAiKey = settings.openAiApiKey?.trim()?.takeIf { it.isNotBlank() }
        val normalizedModel = settings.openAiModel.trim().ifBlank { ReaderSettings().openAiModel }

        jpdbApiKey = normalizedJpdbKey
        openAiApiKey = normalizedOpenAiKey
        openAiModel = normalizedModel

        val prior = _state.value
        val highlightSetting = settings.jpdbHighlightEnabled
        if (highlightEnabledOverride != null && highlightEnabledOverride == highlightSetting) {
            highlightEnabledOverride = null
        }
        val effectiveHighlightEnabled = highlightEnabledOverride ?: highlightSetting

        val envChanged =
            prior.isOnline != isOnline ||
                prior.sessionJwt != normalizedJwt ||
                prior.highlightEnabled != effectiveHighlightEnabled ||
                prior.mixEnabled != settings.mixEnabled ||
                prior.mixAggression != settings.mixAggression ||
                prior.mixAutoEnableHighlight != settings.mixAutoEnableHighlight

        _state.update {
            it.copy(
                isOnline = isOnline,
                sessionJwt = normalizedJwt,
                theme = settings.theme,
                fontSizeSp = settings.fontSizeSp,
                ttsRate = settings.ttsRate,
                cacheTranslations = settings.cacheTranslations,
                translationTargetLang = settings.translationTargetLang,
                cefrLevel = settings.cefrLevel,
                mixEnabled = settings.mixEnabled,
                mixAggression = settings.mixAggression,
                mixAutoEnableHighlight = settings.mixAutoEnableHighlight,
                highlightEnabled = effectiveHighlightEnabled,
                hasJpdbApiKey = !normalizedJpdbKey.isNullOrBlank(),
                hasOpenAiApiKey = !normalizedOpenAiKey.isNullOrBlank(),
            )
        }

        if (envChanged) {
            scheduleMixRefresh()
            scheduleHighlightRefresh()
            scheduleGrammarRefresh()
        }
    }

    fun open(bookId: String) {
        val normalized = bookId.trim()
        if (normalized.isBlank()) return
        if (_state.value.bookId == normalized && _state.value.format != null && !_state.value.isOpening) return

        openJob?.cancel()
        chapterJob?.cancel()
        mixJob?.cancel()
        highlightJob?.cancel()
        grammarJob?.cancel()

        tokenById = emptyMap()
        highlightErrorShownKeys.clear()

        _state.update {
            it.copy(
                bookId = normalized,
                isOpening = true,
                openError = null,
                title = "Reader",
                format = null,
                epubBook = null,
                bookState = BookState(),
                chapterIndex = 0,
                chapterHeadHtml = "",
                chapterBodyHtml = null,
                chapterBaseUrl = null,
                chapterSourceHash = null,
                mixActive = false,
                isApplyingMix = false,
                mixedBodyHtml = null,
                mixedSourceHash = null,
                mixAmbiguousGlosses = emptyList(),
                refinedChoices = emptyMap(),
                isRefiningMix = false,
                isTranslated = false,
                isTranslating = false,
                translatedBodyHtml = null,
                translatedSourceHash = null,
                isApplyingHighlights = false,
                highlightedBodyHtml = null,
                highlightedSourceHash = null,
                highlightedForTranslatedMode = false,
                grammarMarkedBodyHtml = null,
                grammarMarkedSourceHash = null,
                tokenUiById = emptyMap(),
                isJpdbActionBusy = false,
            )
        }

        openJob =
            viewModelScope.launch {
                try {
                    val res = openBookUseCase(normalized)
                    if (res == null) {
                        _state.update { it.copy(openError = "Book is not cached.") }
                        return@launch
                    }

                    _state.update {
                        it.copy(
                            title = res.title,
                            format = res.format,
                            epubBook = res.epubBook,
                        )
                    }

                    runCatching { markBookOpenedUseCase(normalized) }

                    if (res.format != BookFormat.EPUB) return@launch

                    val book = res.epubBook ?: run {
                        _state.update { it.copy(openError = "Failed to open book.") }
                        return@launch
                    }

                    val state = loadBookStateUseCase(normalized)
                    val safeIndex = state.lastChapterIndex.coerceIn(0, book.chapters.lastIndex.coerceAtLeast(0))
                    _state.update { it.copy(bookState = state, chapterIndex = safeIndex) }

                    loadChapter(bookId = normalized, chapterIndex = safeIndex)
                } catch (t: Throwable) {
                    _state.update { it.copy(openError = t.message ?: "Failed to open book") }
                } finally {
                    _state.update { it.copy(isOpening = false) }
                }
            }
    }

    fun selectChapter(index: Int) {
        val book = _state.value.epubBook ?: return
        val next = index.coerceIn(0, book.chapters.lastIndex.coerceAtLeast(0))
        if (next == _state.value.chapterIndex) return
        _state.update { it.copy(chapterIndex = next) }
        loadChapter(bookId = _state.value.bookId ?: return, chapterIndex = next)
    }

    fun nextChapter() {
        val book = _state.value.epubBook ?: return
        val max = book.chapters.lastIndex
        if (_state.value.chapterIndex >= max) {
            _events.tryEmit(ReaderEvent.Snackbar("End of book."))
            return
        }
        selectChapter(_state.value.chapterIndex + 1)
    }

    fun prevChapter() {
        if (_state.value.chapterIndex <= 0) {
            _events.tryEmit(ReaderEvent.Snackbar("Start of book."))
            return
        }
        selectChapter(_state.value.chapterIndex - 1)
    }

    private fun loadChapter(bookId: String, chapterIndex: Int) {
        chapterJob?.cancel()
        mixJob?.cancel()
        highlightJob?.cancel()
        grammarJob?.cancel()
        val expectedBookId = bookId
        val expectedChapter = chapterIndex
        chapterJob =
            viewModelScope.launch {
                val book = _state.value.epubBook ?: return@launch
                val chapter = book.chapters.getOrNull(expectedChapter) ?: return@launch

                // Clear derived state immediately so we never flash stale content.
                _state.update { s ->
                    if (s.bookId != expectedBookId || s.chapterIndex != expectedChapter) return@update s
                    s.copy(
                        chapterHeadHtml = "",
                        chapterBodyHtml = null,
                        chapterBaseUrl = null,
                        chapterSourceHash = null,
                        mixActive = false,
                        isApplyingMix = false,
                        mixedBodyHtml = null,
                        mixedSourceHash = null,
                        mixAmbiguousGlosses = emptyList(),
                        refinedChoices = emptyMap(),
                        isRefiningMix = false,
                        isTranslated = false,
                        isTranslating = false,
                        translatedBodyHtml = null,
                        translatedSourceHash = null,
                        isApplyingHighlights = false,
                        highlightedBodyHtml = null,
                        highlightedSourceHash = null,
                        highlightedForTranslatedMode = false,
                        grammarMarkedBodyHtml = null,
                        grammarMarkedSourceHash = null,
                        tokenUiById = emptyMap(),
                    )
                }
                tokenById = emptyMap()

                val content =
                    runCatching {
                        loadChapterContentUseCase(
                            bookId = expectedBookId,
                            chapterHref = chapter.href,
                        )
                    }.getOrNull()

                if (content == null) {
                    _state.update { it.copy(openError = "Failed to load chapter.") }
                    return@launch
                }

                _state.update { s ->
                    if (s.bookId != expectedBookId || s.chapterIndex != expectedChapter) return@update s
                    s.copy(
                        chapterHeadHtml = content.headHtml,
                        chapterBodyHtml = content.bodyHtml,
                        chapterBaseUrl = content.baseUrl,
                        chapterSourceHash = content.sourceHash,
                    )
                }

                val updated = _state.value.bookState.copy(lastChapterIndex = expectedChapter)
                _state.update { it.copy(bookState = updated) }
                runCatching { saveBookStateUseCase(expectedBookId, updated) }

                val refined = loadLatestMixChoicesUseCase(expectedBookId, expectedChapter)
                _state.update { it.copy(refinedChoices = refined) }

                scheduleMixRefresh()
                scheduleHighlightRefresh()
            }
    }

    fun toggleBookmark() {
        val bookId = _state.value.bookId ?: return
        val now = nowIsoUtcUseCase()

        val current = _state.value.bookState
        val chapterIndex = _state.value.chapterIndex
        val already = current.bookmarks.any { it.chapterIndex == chapterIndex }
        val updated =
            if (already) {
                current.copy(bookmarks = current.bookmarks.filterNot { it.chapterIndex == chapterIndex })
            } else {
                // Keep createdAt stable even if we don't currently surface it.
                current.copy(bookmarks = current.bookmarks + Bookmark(chapterIndex = chapterIndex, createdAt = now))
            }

        _state.update { it.copy(bookState = updated) }
        viewModelScope.launch { runCatching { saveBookStateUseCase(bookId, updated) } }
    }

    fun toggleTranslate() {
        val bookId = _state.value.bookId ?: return
        val chapterIndex = _state.value.chapterIndex
        val body = _state.value.chapterBodyHtml ?: return
        val sourceHash = _state.value.chapterSourceHash ?: return
        val expectedBookId = bookId
        val expectedChapter = chapterIndex
        val expectedSourceHash = sourceHash

        if (_state.value.isTranslated) {
            _state.update { it.copy(isTranslated = false) }
            scheduleMixRefresh()
            scheduleHighlightRefresh()
            scheduleGrammarRefresh()
            return
        }

        viewModelScope.launch {
            val cached =
                if (_state.value.cacheTranslations) {
                    loadCachedTranslationUseCase(
                        bookId = bookId,
                        chapterIndex = chapterIndex,
                        sourceHash = sourceHash,
                        targetLang = _state.value.translationTargetLang,
                        useCefr = false,
                        cefrLevel = _state.value.cefrLevel,
                    )
                } else {
                    null
                }
            if (cached != null) {
                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter || st.chapterSourceHash != expectedSourceHash) return@update st
                    st.copy(
                        isTranslated = true,
                        translatedBodyHtml = cached.html,
                        translatedSourceHash = cached.htmlHash,
                    )
                }
                scheduleMixRefresh()
                scheduleHighlightRefresh()
                scheduleGrammarRefresh()
                return@launch
            }

            if (!_state.value.isOnline) {
                _events.tryEmit(ReaderEvent.Snackbar("Translation requires internet (unless cached)."))
                return@launch
            }
            if (_state.value.sessionJwt.isNullOrBlank()) {
                _events.tryEmit(ReaderEvent.Snackbar("Sign in to translate."))
                return@launch
            }

            _state.update { st ->
                if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter || st.chapterSourceHash != expectedSourceHash) return@update st
                st.copy(isTranslating = true)
            }
            try {
                val model = openAiModel.trim().ifBlank { ReaderSettings().openAiModel }
                val result =
                    translateChapterUseCase(
                        bookId = bookId,
                        chapterIndex = chapterIndex,
                        content = body,
                        sourceHash = sourceHash,
                        targetLang = _state.value.translationTargetLang,
                        model = model,
                        apiKey = openAiApiKey,
                        useCefr = false,
                        cefrLevel = _state.value.cefrLevel,
                        cacheEnabled = _state.value.cacheTranslations,
                    )
                if (result == null) {
                    _events.tryEmit(ReaderEvent.Snackbar("Translation failed."))
                    return@launch
                }

                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter || st.chapterSourceHash != expectedSourceHash) return@update st
                    st.copy(
                        isTranslated = true,
                        translatedBodyHtml = result.html,
                        translatedSourceHash = result.htmlHash,
                    )
                }
                scheduleMixRefresh()
                scheduleHighlightRefresh()
                scheduleGrammarRefresh()
            } finally {
                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter || st.chapterSourceHash != expectedSourceHash) return@update st
                    st.copy(isTranslating = false)
                }
            }
        }
    }

    fun toggleHighlights() {
        val current = _state.value.highlightEnabled
        val next = !current

        highlightEnabledOverride = next
        _state.update { it.copy(highlightEnabled = next) }
        _events.tryEmit(ReaderEvent.PersistHighlightEnabled(next))

        if (next && jpdbApiKey.isNullOrBlank()) {
            _events.tryEmit(
                ReaderEvent.Snackbar(
                    message = "Add a JPDB API key to enable highlights.",
                    actionLabel = "Settings",
                    action = ReaderEventAction.OpenSettings,
                )
            )
        }

        scheduleHighlightRefresh()
        scheduleGrammarRefresh()
    }

    fun refineMix() {
        val s = _state.value
        val bookId = s.bookId ?: return
        val expectedBookId = bookId
        val expectedChapter = s.chapterIndex
        if (!s.mixEnabled) {
            _events.tryEmit(ReaderEvent.Snackbar("Enable mix mode in Settings → Mix."))
            return
        }
        if (s.isTranslated) {
            _events.tryEmit(ReaderEvent.Snackbar("Turn off translation to refine mix mode."))
            return
        }
        if (mirrorSnapshot == null || mixVocabById.isEmpty() || mixGlossIndex.isEmpty()) {
            _events.tryEmit(ReaderEvent.Snackbar("Sync JPDB knowledge in Settings → Mix."))
            return
        }
        if (!s.isOnline) {
            _events.tryEmit(ReaderEvent.Snackbar("Refine requires internet."))
            return
        }
        val key = openAiApiKey
        if (key.isNullOrBlank()) {
            _events.tryEmit(
                ReaderEvent.Snackbar(
                    message = "Add an OpenAI key to refine mix swaps.",
                    actionLabel = "Settings",
                    action = ReaderEventAction.OpenSettings,
                )
            )
            return
        }

        val ambiguousKeys = s.mixAmbiguousGlosses.take(30)
        if (ambiguousKeys.isEmpty()) {
            _events.tryEmit(ReaderEvent.Snackbar("No ambiguous swaps detected in this chapter."))
            return
        }

        val candidatesByKey = LinkedHashMap<String, List<MixRefineCandidate>>()
        for (k in ambiguousKeys) {
            val ids = mixGlossIndex[k].orEmpty().take(3)
            val rows =
                ids.mapNotNull { id ->
                    val rec = mixVocabById[id] ?: return@mapNotNull null
                    MixRefineCandidate(
                        id = id,
                        spelling = rec.spelling,
                        reading = rec.reading,
                        meaning = rec.meanings.firstOrNull(),
                    )
                }
            if (rows.isNotEmpty()) candidatesByKey[k] = rows
        }

        val html = s.chapterBodyHtml.orEmpty()
        val textSample =
            runCatching {
                Jsoup.parse(html).text().replace(Regex("\\s+"), " ").trim()
            }.getOrNull().orEmpty()

        _state.update { st ->
            if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
            st.copy(isRefiningMix = true)
        }
        viewModelScope.launch {
            try {
                val model = openAiModel.trim().ifBlank { ReaderSettings().openAiModel }
                val out =
                    refineMixUseCase(
                        bookId = bookId,
                        chapterIndex = expectedChapter,
                        model = model,
                        openAiApiKey = key,
                        textSample = textSample,
                        ambiguousKeys = ambiguousKeys,
                        candidatesByKey = candidatesByKey,
                    )
                if (out == null) {
                    _events.tryEmit(ReaderEvent.Snackbar("Refine failed."))
                    return@launch
                }

                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                    st.copy(refinedChoices = out.choices)
                }
                _events.tryEmit(ReaderEvent.Snackbar(if (out.fromCache) "Loaded refined swaps (cached)." else "Refined ambiguous swaps."))

                scheduleMixRefresh()
            } catch (t: Throwable) {
                val msg = t.message?.takeIf { it.isNotBlank() } ?: "Refine failed."
                _events.tryEmit(ReaderEvent.Snackbar(msg))
            } finally {
                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                    st.copy(isRefiningMix = false)
                }
            }
        }
    }

    fun clearRefineMix() {
        val s = _state.value
        val bookId = s.bookId ?: return
        viewModelScope.launch {
            runCatching { clearLatestMixChoicesUseCase(bookId = bookId, chapterIndex = s.chapterIndex) }
            _state.update { it.copy(refinedChoices = emptyMap()) }
            _events.tryEmit(ReaderEvent.Snackbar("Cleared refined swaps for this chapter."))
            scheduleMixRefresh()
        }
    }

    private fun computeMixActive(s: ReaderUiState): Boolean {
        if (!s.mixEnabled) return false
        if (s.isTranslated) return false
        if (mirrorSnapshot == null) return false
        if (mixVocabById.isEmpty()) return false
        if (mixGlossIndex.isEmpty()) return false
        return true
    }

    private fun maybeAutoEnableHighlights(s: ReaderUiState) {
        if (!s.mixActive) return
        if (!s.mixAutoEnableHighlight) return
        if (s.highlightEnabled) return

        highlightEnabledOverride = true
        _state.update { it.copy(highlightEnabled = true) }
        _events.tryEmit(ReaderEvent.PersistHighlightEnabled(true))

        if (jpdbApiKey.isNullOrBlank()) {
            _events.tryEmit(
                ReaderEvent.Snackbar(
                    message = "Add a JPDB API key to enable highlights.",
                    actionLabel = "Settings",
                    action = ReaderEventAction.OpenSettings,
                )
            )
        }
    }

    private fun scheduleMixRefresh() {
        mixJob?.cancel()
        val snapshot = _state.value
        if (snapshot.format != BookFormat.EPUB) return
        mixJob =
            viewModelScope.launch {
                val s0 = _state.value
                if (s0.format != BookFormat.EPUB) return@launch
                val expectedBookId = s0.bookId
                val expectedChapter = s0.chapterIndex

                val mixActive = computeMixActive(s0)
                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                    st.copy(mixActive = mixActive)
                }
                if (_state.value.bookId != expectedBookId || _state.value.chapterIndex != expectedChapter) return@launch
                maybeAutoEnableHighlights(_state.value)

                if (!mixActive) {
                    _state.update { st ->
                        if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                        st.copy(isApplyingMix = false, mixedBodyHtml = null, mixedSourceHash = null, mixAmbiguousGlosses = emptyList())
                    }
                    scheduleHighlightRefresh()
                    return@launch
                }

                val body = s0.chapterBodyHtml
                if (body.isNullOrBlank()) {
                    _state.update { st ->
                        if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                        st.copy(isApplyingMix = false, mixedBodyHtml = null, mixedSourceHash = null, mixAmbiguousGlosses = emptyList())
                    }
                    scheduleHighlightRefresh()
                    return@launch
                }

                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                    st.copy(isApplyingMix = true)
                }
                try {
                    val res =
                        applyMixUseCase(
                            bookId = s0.bookId ?: return@launch,
                            chapterIndex = s0.chapterIndex,
                            bodyHtml = body,
                            aggression = s0.mixAggression,
                            glossIndex = mixGlossIndex,
                            vocabById = mixVocabById,
                            refinedChoices = s0.refinedChoices,
                        )

                    _state.update {
                        if (it.bookId != expectedBookId || it.chapterIndex != expectedChapter) return@update it
                        it.copy(
                            mixedBodyHtml = res.html,
                            mixedSourceHash = res.sourceHash,
                            mixAmbiguousGlosses = res.ambiguousGlosses,
                        )
                    }
                } finally {
                    _state.update { st ->
                        if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                        st.copy(isApplyingMix = false)
                    }
                    scheduleHighlightRefresh()
                }
            }
    }

    private data class HighlightInput(
        val bookId: String,
        val chapterIndex: Int,
        val bodyHtml: String,
        val sourceHash: String,
        val isTranslated: Boolean,
    )

    private data class HighlightKey(
        val bookId: String,
        val chapterIndex: Int,
        val sourceHash: String,
        val isTranslated: Boolean,
    )

    private fun computeHighlightInput(s: ReaderUiState): HighlightInput? {
        val bookId = s.bookId ?: return null

        val body =
            if (s.isTranslated) {
                s.translatedBodyHtml
            } else {
                if (s.mixActive) s.mixedBodyHtml else s.chapterBodyHtml
            } ?: return null

        val hash =
            if (s.isTranslated) {
                s.translatedSourceHash
            } else {
                if (s.mixActive) s.mixedSourceHash else s.chapterSourceHash
            } ?: return null

        return HighlightInput(
            bookId = bookId,
            chapterIndex = s.chapterIndex,
            bodyHtml = body,
            sourceHash = hash,
            isTranslated = s.isTranslated,
        )
    }

    private fun HighlightInput.toKey(): HighlightKey =
        HighlightKey(
            bookId = bookId,
            chapterIndex = chapterIndex,
            sourceHash = sourceHash,
            isTranslated = isTranslated,
        )

    private fun highlightErrorKey(input: HighlightInput, reason: String): String =
        "${input.bookId}:${input.chapterIndex}:${input.isTranslated}:${reason}"

    private fun scheduleHighlightRefresh() {
        highlightJob?.cancel()
        if (_state.value.format != BookFormat.EPUB) return
        highlightJob =
            viewModelScope.launch {
                val s0 = _state.value
                val expectedBookId = s0.bookId
                val expectedChapter = s0.chapterIndex
                if (expectedBookId.isNullOrBlank()) return@launch
                if (!s0.highlightEnabled) {
                    tokenById = emptyMap()
                    _state.update {
                        if (it.bookId != expectedBookId || it.chapterIndex != expectedChapter) return@update it
                        it.copy(
                            isApplyingHighlights = false,
                            highlightedBodyHtml = null,
                            highlightedSourceHash = null,
                            highlightedForTranslatedMode = false,
                            tokenUiById = emptyMap(),
                        )
                    }
                    scheduleGrammarRefresh()
                    return@launch
                }

                val input = computeHighlightInput(s0)
                if (input == null) {
                    tokenById = emptyMap()
                    _state.update {
                        if (it.bookId != expectedBookId || it.chapterIndex != expectedChapter) return@update it
                        it.copy(
                            isApplyingHighlights = false,
                            highlightedBodyHtml = null,
                            highlightedSourceHash = null,
                            highlightedForTranslatedMode = false,
                            tokenUiById = emptyMap(),
                        )
                    }
                    scheduleGrammarRefresh()
                    return@launch
                }
                val expectedKey = input.toKey()

                // If state changed before we even start, skip work.
                val currentKey = computeHighlightInput(_state.value)?.toKey()
                if (currentKey != expectedKey) return@launch

                val key = jpdbApiKey?.trim().orEmpty()

                // Clear stale highlights immediately.
                _state.update {
                    if (it.bookId != expectedBookId || it.chapterIndex != expectedChapter) return@update it
                    it.copy(
                        highlightedBodyHtml = null,
                        highlightedSourceHash = null,
                        highlightedForTranslatedMode = false,
                        tokenUiById = emptyMap(),
                    )
                }
                tokenById = emptyMap()

                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                    st.copy(isApplyingHighlights = true)
                }
                val result =
                    runCatching {
                        highlightChapterUseCase(
                            bookId = input.bookId,
                            bodyHtml = input.bodyHtml,
                            chapterIndex = input.chapterIndex,
                            sourceHash = input.sourceHash,
                            jpdbApiKey = key,
                            isOnline = s0.isOnline,
                        )
                    }.getOrNull()
                _state.update { st ->
                    if (st.bookId != expectedBookId || st.chapterIndex != expectedChapter) return@update st
                    st.copy(isApplyingHighlights = false)
                }

                // Only publish results if we're still highlighting the same source.
                val currentKey2 = computeHighlightInput(_state.value)?.toKey()
                if (currentKey2 != expectedKey) return@launch

                if (result == null) {
                    val reason =
                        when {
                            key.isBlank() -> "missing_key"
                            !s0.isOnline -> "offline"
                            else -> "unknown"
                        }
                    val onceKey = highlightErrorKey(input, reason)
                    if (!highlightErrorShownKeys.contains(onceKey)) {
                        highlightErrorShownKeys.add(onceKey)
                        when {
                            key.isBlank() -> {
                                _events.tryEmit(
                                    ReaderEvent.Snackbar(
                                        message = "Add a JPDB API key to enable highlights.",
                                        actionLabel = "Settings",
                                        action = ReaderEventAction.OpenSettings,
                                    )
                                )
                            }
                            !s0.isOnline -> _events.tryEmit(ReaderEvent.Snackbar("Highlights unavailable offline (not cached)."))
                        }
                    }
                    scheduleGrammarRefresh()
                    return@launch
                }

                tokenById = result.tokenById
                _state.update {
                    it.copy(
                        highlightedBodyHtml = result.html,
                        highlightedSourceHash = input.sourceHash,
                        highlightedForTranslatedMode = input.isTranslated,
                        tokenUiById = toTokenUiMap(result.tokenById),
                    )
                }

                scheduleGrammarRefresh()
            }
    }

    private fun scheduleGrammarRefresh() {
        grammarJob?.cancel()
        if (_state.value.format != BookFormat.EPUB) return
        grammarJob =
            viewModelScope.launch {
                val s0 = _state.value
                val expectedBookId = s0.bookId
                val expectedChapter = s0.chapterIndex
                val expectedHighlightHash = s0.highlightedSourceHash
                val enabled =
                    s0.grammarUnderlinesEnabled &&
                        s0.highlightEnabled &&
                        !s0.isTranslated &&
                        learningGrammarPoints.isNotEmpty()
                if (!enabled) {
                    _state.update { it.copy(grammarMarkedBodyHtml = null, grammarMarkedSourceHash = null) }
                    return@launch
                }

                val html = s0.highlightedBodyHtml
                val hash = s0.highlightedSourceHash
                if (html.isNullOrBlank() || hash.isNullOrBlank() || tokenById.isEmpty()) {
                    _state.update { it.copy(grammarMarkedBodyHtml = null, grammarMarkedSourceHash = null) }
                    return@launch
                }

                val tokenSnapshot = tokenById
                val pointsSnapshot = learningGrammarPoints
                val marked =
                    runCatching {
                        underlineGrammarUseCase(
                            highlightedBodyHtml = html,
                            tokenById = tokenSnapshot,
                            learningPoints = pointsSnapshot,
                        )
                    }.getOrNull()
                _state.update {
                    if (it.bookId != expectedBookId || it.chapterIndex != expectedChapter || it.highlightedSourceHash != expectedHighlightHash) return@update it
                    it.copy(
                        grammarMarkedBodyHtml = marked,
                        grammarMarkedSourceHash = hash,
                    )
                }
            }
    }

    fun jpdbMineWord(
        tokenId: String,
        vid: Int,
        sid: Int,
    ) {
        val key = jpdbApiKey?.trim().orEmpty()
        if (key.isBlank()) {
            _events.tryEmit(ReaderEvent.Snackbar("Add a JPDB API key to use actions.", actionLabel = "Settings", action = ReaderEventAction.OpenSettings))
            return
        }
        if (!_state.value.isOnline) {
            _events.tryEmit(ReaderEvent.Snackbar("Online required."))
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(isJpdbActionBusy = true) }
            try {
                val ok = mineWordUseCase(vid = vid, sid = sid, jpdbApiKey = key)
                _events.tryEmit(ReaderEvent.Snackbar(if (ok) "Mined word" else "Mine failed"))
            } finally {
                _state.update { it.copy(isJpdbActionBusy = false) }
            }
        }
    }

    fun jpdbSetFlag(
        tokenId: String,
        vid: Int,
        sid: Int,
        flag: String,
        enabled: Boolean,
    ) {
        val key = jpdbApiKey?.trim().orEmpty()
        if (key.isBlank()) {
            _events.tryEmit(ReaderEvent.Snackbar("Add a JPDB API key to use actions.", actionLabel = "Settings", action = ReaderEventAction.OpenSettings))
            return
        }
        if (!_state.value.isOnline) {
            _events.tryEmit(ReaderEvent.Snackbar("Online required."))
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(isJpdbActionBusy = true) }
            try {
                val res = updateWordStateUseCase(vid = vid, sid = sid, flag = flag, state = enabled, jpdbApiKey = key)
                if (res?.success != true) {
                    _events.tryEmit(ReaderEvent.Snackbar("Update failed"))
                    return@launch
                }

                val base = (res.newState ?: _state.value.tokenUiById[tokenId]?.state?.toList().orEmpty()).toMutableSet()
                val normalized = flag.trim().lowercase()
                // Backend uses "blacklisted" state label for the "blacklist" flag.
                val stateLabel = if (normalized == "blacklist") "blacklisted" else normalized
                if (enabled) base.add(stateLabel) else base.remove(stateLabel)

                updateCachedTokenState(tokenId = tokenId, nextState = base.toList())

                val msg =
                    when (stateLabel) {
                        "never-forget" -> if (enabled) "Marked never-forget" else "Removed never-forget"
                        "blacklisted" -> if (enabled) "Blacklisted" else "Removed blacklist"
                        else -> if (enabled) "Updated" else "Updated"
                    }
                _events.tryEmit(ReaderEvent.Snackbar(msg))
            } finally {
                _state.update { it.copy(isJpdbActionBusy = false) }
            }
        }
    }

    fun jpdbReviewCard(
        tokenId: String,
        vid: Int,
        sid: Int,
        rating: String,
        label: String,
    ) {
        val key = jpdbApiKey?.trim().orEmpty()
        if (key.isBlank()) {
            _events.tryEmit(ReaderEvent.Snackbar("Add a JPDB API key to use actions.", actionLabel = "Settings", action = ReaderEventAction.OpenSettings))
            return
        }
        if (!_state.value.isOnline) {
            _events.tryEmit(ReaderEvent.Snackbar("Online required."))
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(isJpdbActionBusy = true) }
            try {
                val res = reviewCardUseCase(vid = vid, sid = sid, rating = rating, jpdbApiKey = key)
                if (res?.success == true && !res.newState.isNullOrEmpty()) {
                    updateCachedTokenState(tokenId = tokenId, nextState = res.newState)
                }
                _events.tryEmit(ReaderEvent.Snackbar(if (res?.success == true) "Reviewed: $label" else "Review failed"))
            } finally {
                _state.update { it.copy(isJpdbActionBusy = false) }
            }
        }
    }

    private suspend fun updateCachedTokenState(
        tokenId: String,
        nextState: List<String>,
    ) {
        val s = _state.value
        val input = computeHighlightInput(s) ?: return
        if (tokenById.isEmpty()) return

        val updated =
            runCatching {
                updateCachedTokenStateUseCase(
                    bookId = input.bookId,
                    chapterIndex = input.chapterIndex,
                    sourceHash = input.sourceHash,
                    tokenId = tokenId,
                    tokenById = tokenById,
                    nextState = nextState,
                )
            }.getOrDefault(false)

        if (updated) {
            scheduleHighlightRefresh()
        }
    }

    private fun JsonElement?.asStringOrNull(): String? =
        (this as? JsonPrimitive)?.content?.trim()?.takeIf { it.isNotBlank() }

    private fun JsonElement?.asIntOrNull(): Int? =
        (this as? JsonPrimitive)?.content?.trim()?.toIntOrNull()

    private fun JsonObject.toCardUi(): JpdbCardUi {
        val spelling = this["spelling"].asStringOrNull()
        val reading = this["reading"].asStringOrNull()

        val meanings =
            (this["meanings"] as? JsonArray)
                ?.mapNotNull { el ->
                    val obj = el as? JsonObject ?: return@mapNotNull null
                    val pos = obj["partOfSpeech"].asStringOrNull()
                    val glosses =
                        (obj["glosses"] as? JsonArray)
                            ?.mapNotNull { g -> g.asStringOrNull() }
                            ?.filter { it.isNotBlank() }
                            ?: emptyList()
                    if (pos.isNullOrBlank() && glosses.isEmpty()) return@mapNotNull null
                    JpdbMeaningUi(partOfSpeech = pos, glosses = glosses)
                }
                ?: emptyList()

        return JpdbCardUi(spelling = spelling, reading = reading, meanings = meanings)
    }

    private fun toTokenUiMap(tokenById: Map<String, JpdbService.ProcessedToken>): Map<String, JpdbTokenUi> {
        if (tokenById.isEmpty()) return emptyMap()
        return tokenById.mapValues { (tid, token) ->
            val card = token.card
            val vid = card["vid"].asIntOrNull()
            val sid = card["sid"].asIntOrNull()
            val state = normalizeCardState(card["state"]).toSet()
            val cardUi = card.toCardUi()
            JpdbTokenUi(
                id = tid,
                vid = vid,
                sid = sid,
                state = state,
                card = cardUi,
            )
        }
    }
}

class ReaderViewModelFactory(
    private val openBookUseCase: OpenBookUseCase,
    private val markBookOpenedUseCase: MarkBookOpenedUseCase,
    private val loadBookStateUseCase: LoadBookStateUseCase,
    private val saveBookStateUseCase: SaveBookStateUseCase,
    private val nowIsoUtcUseCase: NowIsoUtcUseCase,
    private val loadChapterContentUseCase: LoadChapterContentUseCase,
    private val loadCachedTranslationUseCase: LoadCachedTranslationUseCase,
    private val translateChapterUseCase: TranslateChapterUseCase,
    private val loadJpdbMirrorSnapshotUseCase: LoadJpdbMirrorSnapshotUseCase,
    private val highlightChapterUseCase: HighlightChapterUseCase,
    private val updateCachedTokenStateUseCase: UpdateCachedTokenStateUseCase,
    private val observeGrammarStateUseCase: ObserveGrammarStateUseCase,
    private val underlineGrammarUseCase: UnderlineGrammarUseCase,
    private val loadLatestMixChoicesUseCase: LoadLatestMixChoicesUseCase,
    private val applyMixUseCase: ApplyMixUseCase,
    private val refineMixUseCase: RefineMixUseCase,
    private val clearLatestMixChoicesUseCase: ClearLatestMixChoicesUseCase,
    private val mineWordUseCase: MineWordUseCase,
    private val updateWordStateUseCase: UpdateWordStateUseCase,
    private val reviewCardUseCase: ReviewCardUseCase,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ReaderViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return ReaderViewModel(
                openBookUseCase = openBookUseCase,
                markBookOpenedUseCase = markBookOpenedUseCase,
                loadBookStateUseCase = loadBookStateUseCase,
                saveBookStateUseCase = saveBookStateUseCase,
                nowIsoUtcUseCase = nowIsoUtcUseCase,
                loadChapterContentUseCase = loadChapterContentUseCase,
                loadCachedTranslationUseCase = loadCachedTranslationUseCase,
                translateChapterUseCase = translateChapterUseCase,
                loadJpdbMirrorSnapshotUseCase = loadJpdbMirrorSnapshotUseCase,
                highlightChapterUseCase = highlightChapterUseCase,
                updateCachedTokenStateUseCase = updateCachedTokenStateUseCase,
                observeGrammarStateUseCase = observeGrammarStateUseCase,
                underlineGrammarUseCase = underlineGrammarUseCase,
                loadLatestMixChoicesUseCase = loadLatestMixChoicesUseCase,
                applyMixUseCase = applyMixUseCase,
                refineMixUseCase = refineMixUseCase,
                clearLatestMixChoicesUseCase = clearLatestMixChoicesUseCase,
                mineWordUseCase = mineWordUseCase,
                updateWordStateUseCase = updateWordStateUseCase,
                reviewCardUseCase = reviewCardUseCase,
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

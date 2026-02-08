package com.progressivereader.kmp.grammar

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GrammarExampleMatchSpan(
    val start: Int,
    val end: Int,
    val text: String,
)

@Serializable
data class GrammarTeachingContrast(
    val alternative: String,
    val note: String,
)

@Serializable
data class GrammarExampleTeaching(
    val translation: String? = null,
    val breakdown: String? = null,
    val usageNote: String? = null,
    val contrast: GrammarTeachingContrast? = null,
    val createdAt: String,
    val model: String? = null,
)

@Serializable
data class GrammarExample(
    val id: String, // hash(grammarId|candidateId|sentence|match.start|match.end)
    val grammarId: String,
    val grammarTitle: String,
    val grammarMeaning: String,
    val grammarLevel: String,
    val bookId: String,
    val chapterIndex: Int,
    val sentence: String,
    val before: String? = null,
    val after: String? = null,
    val match: GrammarExampleMatchSpan,
    val explanation: String? = null,
    val teaching: GrammarExampleTeaching? = null,
    val confidence: Double = 0.6,
    val createdAt: String,
)

@Serializable
data class GrammarScanBoundary(
    val uptoChapter: Int,
    val uptoPercent: Double? = null,
    val uptoPage: Int? = null,
)

@Serializable
enum class GrammarScanStatus {
    @SerialName("idle")
    IDLE,
    @SerialName("queued")
    QUEUED,
    @SerialName("scanning")
    SCANNING,
    @SerialName("complete")
    COMPLETE,
    @SerialName("not_found_yet")
    NOT_FOUND_YET,
    @SerialName("error")
    ERROR,
}

@Serializable
data class GrammarScanProgress(
    val booksScanned: Int,
    val booksTotal: Int,
    val chaptersScanned: Int,
)

@Serializable
data class GrammarScanState(
    val status: GrammarScanStatus = GrammarScanStatus.IDLE,
    val lastScanAt: String? = null,
    val lastError: String? = null,
    val scannedBoundaries: Map<String, GrammarScanBoundary> = emptyMap(),
    val progress: GrammarScanProgress? = null,
)

fun mergeAndLimitExamples(
    existing: List<GrammarExample>,
    incoming: List<GrammarExample>,
    limit: Int = 3,
): List<GrammarExample> {
    if (limit <= 0) return emptyList()
    if (existing.isEmpty() && incoming.isEmpty()) return emptyList()

    val byId = LinkedHashMap<String, GrammarExample>()
    for (e in existing) byId[e.id] = e
    for (e in incoming) byId[e.id] = e
    return byId.values.take(limit)
}


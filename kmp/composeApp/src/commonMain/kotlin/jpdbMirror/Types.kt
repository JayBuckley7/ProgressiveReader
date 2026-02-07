package com.progressivereader.kmp.jpdbMirror

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

typealias JpdbVocabId = String // "$vid/$sid"

@Serializable
data class JpdbMirrorDeckSummary(
    val id: String,
    val name: String,
    val words: Int? = null,
)

@Serializable
data class JpdbMirrorMeta(
    val version: Int = 1,
    val syncedAtMs: Long,
    val knownEntryCount: Int,
    val sourceDecks: List<JpdbMirrorDeckSummary> = emptyList(),
)

@Serializable
data class JpdbKnownVocabRecord(
    val id: JpdbVocabId,
    val vid: Int,
    val sid: Int,
    val spelling: String,
    val reading: String? = null,
    val meanings: List<String> = emptyList(),
    val frequencyRank: Int? = null,
    val cardState: List<String> = emptyList(),
    val dueAtMs: Long? = null,
    val updatedAtMs: Long,
)

@Serializable
data class JpdbGlossIndexRow(
    val gloss: String,
    val candidateIds: List<JpdbVocabId> = emptyList(),
    val builtAtMs: Long,
)

@Serializable
data class JpdbMirrorSnapshot(
    val meta: JpdbMirrorMeta,
    val knownVocab: List<JpdbKnownVocabRecord> = emptyList(),
    val glossIndexRows: List<JpdbGlossIndexRow> = emptyList(),
)

fun toVocabId(vid: Int, sid: Int): JpdbVocabId = "$vid/$sid"

fun normalizeCardState(value: JsonElement?): List<String> {
    if (value == null) return emptyList()
    fun normalizeOne(s: String): String? = s.trim().lowercase().takeIf { it.isNotBlank() }
    return when (value) {
        is JsonPrimitive -> listOfNotNull(normalizeOne(value.content))
        is JsonArray -> value.mapNotNull { (it as? JsonPrimitive)?.content?.let(::normalizeOne) }
        else -> emptyList()
    }
}

fun isKnownState(cardState: List<String>): Boolean {
    val s = cardState.map { it.lowercase() }.toSet()
    return (
        s.contains("known") ||
            s.contains("never-forget") ||
            s.contains("never_forget") ||
            s.contains("neverforget")
        )
}

fun normalizeDueAtMs(value: Long?): Long? {
    val v = value ?: return null
    if (v <= 0) return null
    // seconds ≈ 1.7e9, milliseconds ≈ 1.7e12, microseconds ≈ 1.7e15
    return when {
        v > 100_000_000_000_000L -> v / 1000L
        v > 100_000_000_000L -> v
        else -> v * 1000L
    }
}


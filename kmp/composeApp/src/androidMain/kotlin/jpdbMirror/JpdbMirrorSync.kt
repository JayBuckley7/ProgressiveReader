package com.progressivereader.kmp.jpdbMirror

import com.progressivereader.kmp.drive.DriveJsonFileService
import com.progressivereader.kmp.vocabulary.Deck
import com.progressivereader.kmp.vocabulary.JpdbVocabPair
import com.progressivereader.kmp.vocabulary.VocabularyService
import kotlin.math.min
import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

sealed interface JpdbMirrorSyncPhase {
    data object Decks : JpdbMirrorSyncPhase
    data object Pairs : JpdbMirrorSyncPhase
    data object Lookup : JpdbMirrorSyncPhase
    data object Index : JpdbMirrorSyncPhase
    data object Save : JpdbMirrorSyncPhase
    data object Backup : JpdbMirrorSyncPhase
    data object Restore : JpdbMirrorSyncPhase
}

data class JpdbMirrorSyncProgress(
    val phase: JpdbMirrorSyncPhase,
    val loaded: Int? = null,
    val total: Int? = null,
    val message: String? = null,
)

private fun normalizeDeckSummaries(decks: List<Deck>): List<JpdbMirrorDeckSummary> =
    decks.mapNotNull { d ->
        val id = d.id.trim()
        val name = d.name.trim()
        if (id.isBlank() || name.isBlank()) return@mapNotNull null
        JpdbMirrorDeckSummary(id = id, name = name, words = d.words)
    }

suspend fun syncJpdbKnownMirror(
    vocabularyService: VocabularyService,
    jpdbApiKey: String,
    onProgress: ((JpdbMirrorSyncProgress) -> Unit)? = null,
): JpdbMirrorSnapshot? {
    val key = jpdbApiKey.trim()
    if (key.isBlank()) return null

    onProgress?.invoke(JpdbMirrorSyncProgress(phase = JpdbMirrorSyncPhase.Decks, message = "Loading decks…"))
    val decks = vocabularyService.listUserDecks(jpdbApiKey = key)
    val deckSummaries = normalizeDeckSummaries(decks)

    onProgress?.invoke(
        JpdbMirrorSyncProgress(
            phase = JpdbMirrorSyncPhase.Decks,
            loaded = 1,
            total = 1,
            message = "Found ${deckSummaries.size} decks",
        )
    )

    val pairSet = LinkedHashSet<JpdbVocabPair>()
    onProgress?.invoke(JpdbMirrorSyncProgress(phase = JpdbMirrorSyncPhase.Pairs, loaded = 0, total = deckSummaries.size, message = "Listing deck vocabulary…"))
    for ((i, deck) in deckSummaries.withIndex()) {
        val pairs = vocabularyService.listDeckVocabulary(deckId = deck.id, jpdbApiKey = key)
        pairSet.addAll(pairs)
        onProgress?.invoke(
            JpdbMirrorSyncProgress(
                phase = JpdbMirrorSyncPhase.Pairs,
                loaded = i + 1,
                total = deckSummaries.size,
                message = "Loaded ${pairSet.size} unique pairs",
            )
        )
        // Keep backend spikes down.
        if (i + 1 < deckSummaries.size) delay(100)
    }

    val pairs = pairSet.toList()
    val fields = listOf("spelling", "reading", "meanings", "frequency_rank", "card_state", "due_at")
    val batchSize = 400

    onProgress?.invoke(
        JpdbMirrorSyncProgress(
            phase = JpdbMirrorSyncPhase.Lookup,
            loaded = 0,
            total = pairs.size,
            message = "Looking up vocabulary…",
        )
    )

    val updatedAtMs = System.currentTimeMillis()
    val knownRecords = ArrayList<JpdbKnownVocabRecord>()

    for (i in pairs.indices step batchSize) {
        val chunk = pairs.subList(i, min(pairs.size, i + batchSize))
        val entries = vocabularyService.lookupVocabulary(pairs = chunk, fields = fields, jpdbApiKey = key, chunkSize = batchSize)
        for (e in entries) {
            val cardState = normalizeCardState(e.cardStateRaw)
            if (!isKnownState(cardState)) continue

            val spelling = e.spelling?.trim().orEmpty()
            if (spelling.isBlank()) continue

            knownRecords.add(
                JpdbKnownVocabRecord(
                    id = toVocabId(e.vid, e.sid),
                    vid = e.vid,
                    sid = e.sid,
                    spelling = spelling,
                    reading = e.reading?.trim()?.takeIf { it.isNotBlank() },
                    meanings = e.meanings,
                    frequencyRank = e.frequencyRank,
                    cardState = cardState,
                    dueAtMs = normalizeDueAtMs(e.dueAt),
                    updatedAtMs = updatedAtMs,
                )
            )
        }

        onProgress?.invoke(
            JpdbMirrorSyncProgress(
                phase = JpdbMirrorSyncPhase.Lookup,
                loaded = min(pairs.size, i + batchSize),
                total = pairs.size,
                message = "Looked up ${min(pairs.size, i + batchSize)} / ${pairs.size}",
            )
        )
        if (i + batchSize < pairs.size) delay(200)
    }

    onProgress?.invoke(JpdbMirrorSyncProgress(phase = JpdbMirrorSyncPhase.Index, message = "Building English gloss index…"))
    val builtAtMs = System.currentTimeMillis()
    val glossIndexRows = buildGlossIndexRows(knownRecords, builtAtMs)

    val meta =
        JpdbMirrorMeta(
            version = 1,
            syncedAtMs = builtAtMs,
            knownEntryCount = knownRecords.size,
            sourceDecks = deckSummaries,
        )

    return JpdbMirrorSnapshot(
        meta = meta,
        knownVocab = knownRecords,
        glossIndexRows = glossIndexRows,
    )
}

suspend fun backupMirrorSnapshotToDrive(
    driveJson: DriveJsonFileService,
    snapshot: JpdbMirrorSnapshot,
    onProgress: ((JpdbMirrorSyncProgress) -> Unit)? = null,
): Boolean {
    onProgress?.invoke(JpdbMirrorSyncProgress(phase = JpdbMirrorSyncPhase.Backup, message = "Backing up mirror to Drive…"))

    val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            prettyPrint = true
        }
    val element = json.encodeToJsonElement(JpdbMirrorSnapshot.serializer(), snapshot)
    val obj: JsonObject = runCatching { element.jsonObject }.getOrNull() ?: return false

    val res =
        driveJson.upsertJson(
            fileName = "jpdb_mirror_v1.json",
            defaultJson = JsonObject(emptyMap()),
        ) { _ -> obj }
    return res != null
}

suspend fun restoreMirrorSnapshotFromDrive(
    driveJson: DriveJsonFileService,
    onProgress: ((JpdbMirrorSyncProgress) -> Unit)? = null,
): JpdbMirrorSnapshot? {
    onProgress?.invoke(JpdbMirrorSyncProgress(phase = JpdbMirrorSyncPhase.Restore, message = "Restoring mirror from Drive…"))
    val loaded = driveJson.loadJson("jpdb_mirror_v1.json") ?: return null

    val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
        }
    return runCatching { json.decodeFromJsonElement(JpdbMirrorSnapshot.serializer(), loaded.json) }.getOrNull()
}

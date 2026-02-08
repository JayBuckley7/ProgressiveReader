package com.progressivereader.kmp.grammar

import com.progressivereader.kmp.drive.DriveJsonFileService
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement

data class DriveGrammarState(
    val knownIds: Set<String>,
    val learningIds: Set<String>,
    val examplesByGrammarId: Map<String, List<GrammarExample>>,
)

private val driveJson =
    Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
        prettyPrint = true
    }

private fun JsonElement?.asStringList(): List<String> =
    (this as? JsonArray)
        ?.mapNotNull { (it as? JsonPrimitive)?.content?.trim()?.takeIf { s -> s.isNotBlank() } }
        .orEmpty()

private fun parseExamplesMap(value: JsonElement?): Map<String, List<GrammarExample>> {
    val obj = (value as? JsonObject) ?: return emptyMap()
    val out = LinkedHashMap<String, List<GrammarExample>>()
    for ((gid, raw) in obj) {
        val arr = (raw as? JsonArray) ?: continue
        val parsed =
            arr.mapNotNull { el ->
                decodeExampleLenient(el)
            }
        if (parsed.isNotEmpty()) out[gid] = parsed
    }
    return out
}

private fun decodeExampleLenient(el: JsonElement): GrammarExample? {
    // Preferred: strict decode of the current schema.
    runCatching { driveJson.decodeFromJsonElement(GrammarExample.serializer(), el) }.getOrNull()?.let { return it }

    // Fallback: older/partial schema. Best-effort mapping.
    val obj = el as? JsonObject ?: return null

    fun JsonElement?.asString(): String? = (this as? JsonPrimitive)?.content?.trim()?.takeIf { it.isNotBlank() }
    fun JsonElement?.asInt(): Int? = (this as? JsonPrimitive)?.content?.toIntOrNull()
    fun JsonElement?.asDouble(): Double? = (this as? JsonPrimitive)?.content?.toDoubleOrNull()

    val grammarId = obj["grammarId"].asString() ?: return null
    val point = getGrammarPointById(grammarId)

    val sentence = obj["sentence"].asString() ?: return null
    val bookId = obj["bookId"].asString() ?: return null
    val chapterIndex = obj["chapterIndex"].asInt() ?: obj["chapter"].asInt() ?: 0

    val matchObj = obj["match"] as? JsonObject ?: return null
    val start = (matchObj["start"] as? JsonPrimitive)?.content?.toIntOrNull() ?: return null
    val end = (matchObj["end"] as? JsonPrimitive)?.content?.toIntOrNull() ?: return null
    val safeStart = start.coerceIn(0, sentence.length)
    val safeEnd = end.coerceIn(safeStart, sentence.length)
    val matchText = matchObj["text"].asString() ?: sentence.substring(safeStart, safeEnd)

    val id =
        obj["id"].asString()
            ?: buildString {
                append(grammarId)
                append("|")
                append(bookId)
                append("|")
                append(chapterIndex)
                append("|")
                append(sentence.hashCode())
                append("|")
                append(safeStart)
                append("|")
                append(safeEnd)
            }

    val createdAt = obj["createdAt"].asString() ?: GrammarMiningStore.isoNowUtc()
    val confidence = obj["confidence"].asDouble()?.coerceIn(0.0, 1.0) ?: 0.6

    val teaching =
        runCatching { driveJson.decodeFromJsonElement(GrammarExampleTeaching.serializer(), obj["teaching"] ?: JsonObject(emptyMap())) }
            .getOrNull()

    return GrammarExample(
        id = id,
        grammarId = grammarId,
        grammarTitle = obj["grammarTitle"].asString() ?: point?.title ?: grammarId,
        grammarMeaning = obj["grammarMeaning"].asString() ?: point?.meaning ?: "",
        grammarLevel = obj["grammarLevel"].asString() ?: point?.level?.id ?: grammarId.substringBefore(':', missingDelimiterValue = "n5"),
        bookId = bookId,
        chapterIndex = chapterIndex,
        sentence = sentence,
        before = obj["before"].asString(),
        after = obj["after"].asString(),
        match = GrammarExampleMatchSpan(start = safeStart, end = safeEnd, text = matchText),
        explanation = obj["explanation"].asString(),
        teaching = teaching,
        confidence = confidence,
        createdAt = createdAt,
    )
}

fun parseGrammarJsonFile(json: JsonObject): DriveGrammarState {
    val version = (json["version"] as? JsonPrimitive)?.content?.trim().orEmpty()

    val known =
        when {
            json["knownIds"] is JsonArray -> json["knownIds"].asStringList()
            json["known_ids"] is JsonArray -> json["known_ids"].asStringList()
            version.startsWith("2") -> json["known"].asStringList()
            json["known"] is JsonArray -> json["known"].asStringList()
            else -> emptyList()
        }

    val learning =
        when {
            json["learningIds"] is JsonArray -> json["learningIds"].asStringList()
            json["learning_ids"] is JsonArray -> json["learning_ids"].asStringList()
            version.startsWith("2") -> json["learning"].asStringList()
            json["learning"] is JsonArray -> json["learning"].asStringList()
            else -> emptyList()
        }

    val examplesBy =
        when {
            json["examplesByGrammarId"] is JsonObject -> parseExamplesMap(json["examplesByGrammarId"])
            json["examples_by_grammar_id"] is JsonObject -> parseExamplesMap(json["examples_by_grammar_id"])
            version.startsWith("2") -> parseExamplesMap(json["examples"])
            else -> emptyMap()
        }

    val knownSet = known.map { it.trim() }.filter { it.isNotBlank() }.toSet()
    val learningSet =
        learning.map { it.trim() }
            .filter { it.isNotBlank() && !knownSet.contains(it) }
            .toSet()

    return DriveGrammarState(
        knownIds = knownSet,
        learningIds = learningSet,
        examplesByGrammarId = examplesBy,
    )
}

suspend fun loadGrammarFromDrive(driveJsonService: DriveJsonFileService): DriveGrammarState? {
    val loaded = driveJsonService.loadJson("grammar.json") ?: return null
    if (loaded.json.isEmpty()) return null
    return runCatching { parseGrammarJsonFile(loaded.json) }.getOrNull()
}

suspend fun saveGrammarToDrive(
    driveJsonService: DriveJsonFileService,
    knownIds: Set<String>,
    learningIds: Set<String>,
    examplesByGrammarId: Map<String, List<GrammarExample>>,
): Boolean {
    val known = knownIds.map { it.trim() }.filter { it.isNotBlank() }.distinct()
    val knownSet = known.toSet()
    val learning = learningIds.map { it.trim() }.filter { it.isNotBlank() && !knownSet.contains(it) }.distinct()

    // Encode examples as JSON so the Drive file matches web's schema.
    val examplesObj =
        buildJsonObject {
            for ((gid, list) in examplesByGrammarId) {
                val safeId = gid.trim()
                if (safeId.isBlank()) continue
                val arr =
                    JsonArray(
                        list.take(3).mapNotNull { ex ->
                            runCatching { driveJson.encodeToJsonElement(GrammarExample.serializer(), ex) }.getOrNull()
                        }
                    )
                put(safeId, arr)
            }
        }

    val payload: JsonObject =
        buildJsonObject {
            put("version", JsonPrimitive("2.0"))
            put("known", JsonArray(known.map { JsonPrimitive(it) }))
            put("learning", JsonArray(learning.map { JsonPrimitive(it) }))
            put("examples", examplesObj)
            put("lastUpdated", JsonPrimitive(GrammarMiningStore.isoNowUtc()))
        }

    val res =
        driveJsonService.upsertJson(
            fileName = "grammar.json",
            defaultJson = JsonObject(emptyMap()),
        ) { _ -> payload }
    return res != null
}

package com.progressivereader.kmp.mix

import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// Ported from web: frontend/src/features/reader/utils/englishSwapRefine.ts

data class MixRefineCandidate(
    val id: String,
    val spelling: String,
    val reading: String? = null,
    val meaning: String? = null,
)

typealias MixRefineChoices = Map<String, String?> // glossKey -> vocabId (vid/sid) or null

private fun fnv1a32(input: String): Long {
    var hash = 0x811c9dc5L
    for (c in input) {
        hash = hash xor c.code.toLong()
        hash = (hash * 0x01000193L) and 0xFFFFFFFFL
    }
    return hash and 0xFFFFFFFFL
}

private fun stableHashHex(input: String): String = fnv1a32(input).toString(16).padStart(8, '0')

private fun stripCodeFences(s: String): String {
    var out = s.trim()
    if (out.startsWith("```")) {
        out = out.replaceFirst(Regex("^```[a-zA-Z]*\\n?"), "")
        out = out.replace(Regex("```$"), "")
    }
    return out.trim()
}

private fun splitSentences(text: String): List<String> {
    val cleaned = text.replace(Regex("\\s+"), " ").trim()
    if (cleaned.isBlank()) return emptyList()
    // Very naive sentence split; good enough for context selection.
    return cleaned.split(Regex("(?<=[.!?])\\s+")).map { it.trim() }.filter { it.isNotBlank() }
}

private fun pickExampleSentences(text: String, glossKey: String, max: Int): List<String> {
    val sentences = splitSentences(text)
    if (sentences.isEmpty()) return emptyList()

    val needle = glossKey.lowercase()
    val hits = ArrayList<String>()
    for (s in sentences) {
        if (hits.size >= max) break
        if (s.lowercase().contains(needle)) hits.add(s)
    }
    if (hits.size >= minOf(2, max)) return hits
    return sentences.take(max)
}

fun getMixRefineCacheKey(
    bookId: String,
    chapter: Int,
    model: String,
    textSample: String,
    ambiguousKeys: List<String>,
    candidatesByKey: Map<String, List<String>>,
): String {
    val normalizedModel = model.trim().ifBlank { "gpt-4o-mini" }
    val keys =
        ambiguousKeys.map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
            .sorted()

    val sortedCandidates = candidatesByKey.entries.sortedBy { it.key }.mapNotNull { (k, ids) ->
        val list = ids.map { it.trim() }.filter { it.isNotBlank() }
        if (k.isBlank() || list.isEmpty()) return@mapNotNull null
        k to list
    }

    val json =
        Json {
            encodeDefaults = true
            prettyPrint = false
        }

    // Keep ordering stable for hashing: insert keys in a deterministic order.
    val normalized =
        buildJsonObject {
            put("model", normalizedModel)
            put("ambiguousKeys", JsonArray(keys.map { JsonPrimitive(it) }))
            put(
                "candidatesByKey",
                buildJsonObject {
                    for ((k, ids) in sortedCandidates) {
                        put(k, JsonArray(ids.map { JsonPrimitive(it) }))
                    }
                },
            )
            put("textSample", textSample.take(4000))
        }

    val hash = stableHashHex(json.encodeToString(JsonElement.serializer(), normalized))
    return "prMixRefine:${bookId.trim()}:${chapter}:${normalizedModel}:${hash}"
}

suspend fun refineAmbiguousSwaps(
    openAiKey: String,
    model: String,
    textSample: String,
    ambiguousKeys: List<String>,
    candidatesByKey: Map<String, List<MixRefineCandidate>>,
    http: HttpClient = createHttpClient(),
): MixRefineChoices {
    val key = openAiKey.trim()
    require(key.isNotBlank()) { "Missing OpenAI API key" }

    val normalizedModel = model.trim().ifBlank { "gpt-4o-mini" }
    val keys =
        ambiguousKeys.map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
            .take(30)
    if (keys.isEmpty()) return emptyMap()

    val payload =
        keys.map { glossKey ->
            val candidates = candidatesByKey[glossKey].orEmpty().take(3)
            buildJsonObject {
                put("glossKey", glossKey)
                put("examples", JsonArray(pickExampleSentences(textSample, glossKey, 5).map { JsonPrimitive(it) }))
                put(
                    "candidates",
                    JsonArray(
                        candidates.map { c ->
                            buildJsonObject {
                                put("id", c.id)
                                put("spelling", c.spelling)
                                put("reading", c.reading.orEmpty())
                                put("meaning", c.meaning.orEmpty())
                            }
                        },
                    ),
                )
            }
        }

    val system =
        "You choose the best Japanese vocabulary candidate for each English noun phrase in context. " +
            "Return STRICT JSON only, no prose, no markdown."

    val user =
        "Given the following English context and candidate Japanese words, pick the best replacement for each glossKey. " +
            "If none fit, set it to null.\n\n" +
            "Return JSON in this exact shape:\n" +
            "{ \"choices\": { \"glossKey\": \"vid/sid or null\", \"...\": null } }\n\n" +
            "Context (excerpt):\n${textSample.take(4000)}\n\n" +
            "Tasks:\n${Json { prettyPrint = true }.encodeToString(JsonElement.serializer(), JsonArray(payload))}\n"

    val reqBody: JsonObject =
        buildJsonObject {
            put("model", normalizedModel)
            put("temperature", 0)
            put(
                "messages",
                JsonArray(
                    listOf(
                        buildJsonObject {
                            put("role", "system")
                            put("content", system)
                        },
                        buildJsonObject {
                            put("role", "user")
                            put("content", user)
                        },
                    ),
                ),
            )
            put(
                "response_format",
                buildJsonObject {
                    put("type", "json_object")
                },
            )
        }

    val resp =
        http.post("https://api.openai.com/v1/chat/completions") {
            headers.append(HttpHeaders.Authorization, "Bearer $key")
            contentType(ContentType.Application.Json)
            setBody(reqBody)
        }

    val bodyText = runCatching { resp.bodyAsText() }.getOrNull().orEmpty()
    if (!resp.status.isSuccess()) {
        val msg = bodyText.ifBlank { "HTTP ${resp.status.value}" }
        throw IllegalStateException(msg)
    }

    val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
        }
    val root: JsonObject =
        runCatching {
            val el = json.parseToJsonElement(bodyText)
            (el as? JsonObject) ?: JsonObject(emptyMap())
        }.getOrElse { JsonObject(emptyMap()) }

    fun JsonObject.getPath(vararg parts: String): JsonElement? {
        var cur: JsonElement = this
        for (p in parts) {
            cur =
                when (cur) {
                    is JsonObject -> cur[p] ?: return null
                    is JsonArray -> {
                        val idx = p.toIntOrNull() ?: return null
                        cur.getOrNull(idx) ?: return null
                    }
                    else -> return null
                }
        }
        return cur
    }

    val rawContent =
        (root.getPath("choices", "0", "message", "content") as? JsonPrimitive)?.content?.trim().orEmpty()
    val content = stripCodeFences(rawContent)

    val parsedChoices: JsonObject? =
        runCatching {
            val el = json.parseToJsonElement(content)
            val obj = el as? JsonObject ?: return@runCatching null
            obj["choices"] as? JsonObject
        }.getOrNull()
            ?: runCatching {
                // Last-ditch: find first JSON object in the response.
                val start = content.indexOf('{')
                val end = content.lastIndexOf('}')
                if (start < 0 || end <= start) return@runCatching null
                val el = json.parseToJsonElement(content.substring(start, end + 1))
                val obj = el as? JsonObject ?: return@runCatching null
                obj["choices"] as? JsonObject
            }.getOrNull()

    if (parsedChoices == null) return emptyMap()

    val out = LinkedHashMap<String, String?>()
    for (k in keys) {
        val v = parsedChoices[k]
        when (v) {
            is JsonPrimitive -> {
                if (v.isString) {
                    val s = v.content.trim()
                    if (s.isNotBlank()) out[k] = s
                } else {
                    // If model returns literal null, kotlinx JSON will represent it as JsonNull (not JsonPrimitive).
                }
            }
            is kotlinx.serialization.json.JsonNull -> out[k] = null
            else -> {
                // JsonNull or other => ignore.
            }
        }
    }

    return out
}

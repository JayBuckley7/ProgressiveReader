package com.progressivereader.kmp.mix

import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class MixRefineStore(private val bookDir: File) {
    @Serializable
    data class CachedRefine(
        val choices: Map<String, String?> = emptyMap(),
        val createdAtMs: Long,
    )

    private val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            prettyPrint = true
        }

    private fun rootDir(): File = File(bookDir, "mix_refine")

    private fun sanitizeKey(key: String): String =
        key.trim()
            .replace('/', '_')
            .replace('\\', '_')

    private fun cacheFile(cacheKey: String): File = File(rootDir(), sanitizeKey(cacheKey) + ".json")

    private fun latestPointer(chapter: Int): File = File(rootDir(), "latest_$chapter.txt")

    suspend fun loadLatestChoices(chapter: Int): Map<String, String?> =
        withContext(Dispatchers.IO) {
            val pointer = latestPointer(chapter)
            if (!pointer.exists()) return@withContext emptyMap()
            val key = runCatching { pointer.readText(Charsets.UTF_8).trim() }.getOrNull().orEmpty()
            if (key.isBlank()) return@withContext emptyMap()
            loadChoices(cacheKey = key) ?: emptyMap()
        }

    suspend fun loadChoices(cacheKey: String): Map<String, String?>? =
        withContext(Dispatchers.IO) {
            val f = cacheFile(cacheKey)
            if (!f.exists()) return@withContext null
            val parsed = runCatching { json.decodeFromString(CachedRefine.serializer(), f.readText(Charsets.UTF_8)) }.getOrNull()
            parsed?.choices
        }

    suspend fun saveChoices(cacheKey: String, choices: Map<String, String?>) =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            dir.mkdirs()
            val f = cacheFile(cacheKey)
            val tmp = File(dir, "${f.name}.tmp")
            val payload = CachedRefine(choices = choices, createdAtMs = System.currentTimeMillis())
            tmp.writeText(json.encodeToString(CachedRefine.serializer(), payload), Charsets.UTF_8)
            if (!tmp.renameTo(f)) {
                f.writeText(tmp.readText(Charsets.UTF_8), Charsets.UTF_8)
                tmp.delete()
            }
        }

    suspend fun setLatest(chapter: Int, cacheKey: String) =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            dir.mkdirs()
            val f = latestPointer(chapter)
            f.writeText(cacheKey.trim(), Charsets.UTF_8)
        }

    suspend fun clearLatest(chapter: Int) =
        withContext(Dispatchers.IO) {
            runCatching { latestPointer(chapter).delete() }
        }
}


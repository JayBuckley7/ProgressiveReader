package com.progressivereader.kmp.mix

import com.progressivereader.kmp.core.atomicWriteUtf8
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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

    private val writeMutex = Mutex()

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
            val payload = CachedRefine(choices = choices, createdAtMs = System.currentTimeMillis())
            val content = json.encodeToString(CachedRefine.serializer(), payload)
            writeMutex.withLock { atomicWriteUtf8(f, content) }
        }

    suspend fun setLatest(chapter: Int, cacheKey: String) =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            dir.mkdirs()
            val f = latestPointer(chapter)
            writeMutex.withLock { atomicWriteUtf8(f, cacheKey.trim()) }
        }

    suspend fun clearLatest(chapter: Int) =
        withContext(Dispatchers.IO) {
            runCatching { latestPointer(chapter).delete() }
        }
}

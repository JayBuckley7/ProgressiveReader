package com.progressivereader.kmp.reader

import com.progressivereader.kmp.jpdb.JpdbService
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Serializable
data class CachedJpdbToken(
    val id: String,
    val start: Int,
    val length: Int,
    val end: Int,
    val card: JsonObject,
    val rubies: List<JpdbService.Ruby> = emptyList(),
)

@Serializable
data class JpdbTokenCacheFile(
    val version: Int = 1,
    val createdAt: String,
    val sourceHash: String,
    val tokens: List<CachedJpdbToken>,
)

class JpdbTokenCache(private val bookDir: File) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
            prettyPrint = true
        }

    private fun safeHashPrefix(sourceHash: String): String {
        val h = sourceHash.trim()
        // Keep filenames short but unique enough for our use (cache); 48 bits of hex is plenty.
        return if (h.length <= 12) h else h.substring(0, 12)
    }

    // Cache is keyed by the exact HTML being highlighted (sourceHash), so translated variants can coexist.
    private fun fileFor(chapterIndex: Int, sourceHash: String): File =
        File(File(bookDir, "jpdb"), "${chapterIndex}_${safeHashPrefix(sourceHash)}.json")

    // Legacy single-cache-per-chapter filename (kept for backward compatibility).
    private fun legacyFileFor(chapterIndex: Int): File = File(File(bookDir, "jpdb"), "$chapterIndex.json")

    suspend fun loadIfValid(chapterIndex: Int, sourceHash: String): JpdbTokenCacheFile? =
        withContext(Dispatchers.IO) {
            fun parseIfMatches(f: File): JpdbTokenCacheFile? {
                if (!f.exists()) return null
                val parsed =
                    runCatching { json.decodeFromString(JpdbTokenCacheFile.serializer(), f.readText()) }
                        .getOrNull()
                        ?: return null
                if (parsed.sourceHash != sourceHash) return null
                return parsed
            }

            // Prefer the new per-hash cache file.
            val primary = parseIfMatches(fileFor(chapterIndex, sourceHash))
            if (primary != null) return@withContext primary

            // Backward compatibility: fall back to the legacy per-chapter file if present.
            parseIfMatches(legacyFileFor(chapterIndex))
        }

    suspend fun save(chapterIndex: Int, entry: JpdbTokenCacheFile) =
        withContext(Dispatchers.IO) {
            val f = fileFor(chapterIndex, entry.sourceHash)
            f.parentFile?.mkdirs()
            atomicWrite(
                target = f,
                content = json.encodeToString(JpdbTokenCacheFile.serializer(), entry),
            )
        }

    companion object {
        fun tokenId(token: JpdbService.ProcessedToken): String {
            val vid = (token.card["vid"] as? JsonPrimitive)?.content
            val sid = (token.card["sid"] as? JsonPrimitive)?.content
            val prefix = if (!vid.isNullOrBlank() && !sid.isNullOrBlank()) "$vid/$sid" else ""
            return if (prefix.isBlank()) "@${token.start}-${token.end}" else "$prefix@${token.start}-${token.end}"
        }

        fun toCachedToken(token: JpdbService.ProcessedToken): CachedJpdbToken =
            CachedJpdbToken(
                id = tokenId(token),
                start = token.start,
                length = token.length,
                end = token.end,
                card = token.card,
                rubies = token.rubies,
            )

        fun toProcessedToken(token: CachedJpdbToken): JpdbService.ProcessedToken =
            JpdbService.ProcessedToken(
                start = token.start,
                length = token.length,
                end = token.end,
                card = token.card,
                rubies = token.rubies,
            )

        private fun atomicWrite(target: File, content: String) {
            val tmp = File(target.parentFile, "${target.name}.tmp")
            tmp.writeText(content)
            if (!tmp.renameTo(target)) {
                target.writeText(content)
                tmp.delete()
            }
        }
    }
}

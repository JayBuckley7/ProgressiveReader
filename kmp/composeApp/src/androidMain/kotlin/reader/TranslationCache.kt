package com.progressivereader.kmp.reader

import com.progressivereader.kmp.core.atomicWriteUtf8
import com.progressivereader.kmp.domain.reader.TranslationCacheEntry
import java.io.File
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class TranslationCache(
    private val bookDir: File,
) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
            prettyPrint = true
        }

    private val writeMutex = Mutex()

    private fun fileFor(chapterIndex: Int): File =
        File(File(bookDir, "translations"), "$chapterIndex.json")

    suspend fun loadIfValid(
        chapterIndex: Int,
        sourceHash: String,
        targetLang: String,
        useCefr: Boolean,
        cefrLevel: String,
    ): TranslationCacheEntry? =
        withContext(Dispatchers.IO) {
            val f = fileFor(chapterIndex)
            if (!f.exists()) return@withContext null
            val entry =
                runCatching { json.decodeFromString(TranslationCacheEntry.serializer(), f.readText()) }
                    .getOrNull()
                    ?: return@withContext null

            if (entry.sourceHash != sourceHash) return@withContext null
            if (!entry.targetLang.equals(targetLang, ignoreCase = true)) return@withContext null
            if (entry.useCefr != useCefr) return@withContext null
            if (entry.cefrLevel != cefrLevel) return@withContext null
            entry
        }

    suspend fun save(chapterIndex: Int, entry: TranslationCacheEntry) =
        withContext(Dispatchers.IO) {
            val f = fileFor(chapterIndex)
            f.parentFile?.mkdirs()
            val content = json.encodeToString(TranslationCacheEntry.serializer(), entry)
            writeMutex.withLock { atomicWriteUtf8(target = f, content = content) }
        }

    companion object {
        fun isoNowUtc(): String {
            val fmt =
                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
            return fmt.format(Date())
        }

        fun sha256Hex(text: String): String {
            val md = MessageDigest.getInstance("SHA-256")
            val bytes = md.digest(text.toByteArray(Charsets.UTF_8))
            return bytes.joinToString(separator = "") { b -> "%02x".format(b) }
        }
    }
}

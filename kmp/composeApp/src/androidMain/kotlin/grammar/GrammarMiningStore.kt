package com.progressivereader.kmp.grammar

import android.content.Context
import com.progressivereader.kmp.core.atomicWriteUtf8
import java.io.File
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

@Serializable
data class GrammarMiningSnapshot(
    val version: Int = 1,
    val updatedAt: String,
    val examplesByGrammarId: Map<String, List<GrammarExample>> = emptyMap(),
    val scanByGrammarId: Map<String, GrammarScanState> = emptyMap(),
)

class GrammarMiningStore(context: Context) {
    private val appContext = context.applicationContext
    private val writeMutex = Mutex()

    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
            prettyPrint = true
        }

    private fun rootDir(): File = File(appContext.filesDir, "grammar_mining")

    private fun snapshotFile(): File = File(rootDir(), "grammar_mining_v1.json")
    private fun snapshotBakFile(): File = File(rootDir(), "grammar_mining_v1.json.bak")
    private fun legacyTmpFile(): File = File(rootDir(), "grammar_mining_v1.json.tmp")

    suspend fun loadSnapshot(): GrammarMiningSnapshot =
        withContext(Dispatchers.IO) {
            val f = snapshotFile()
            if (!f.exists()) {
                return@withContext GrammarMiningSnapshot(updatedAt = isoNowUtc())
            }
            fun parseOrNull(file: File): GrammarMiningSnapshot? {
                if (!file.exists()) return null
                val text = runCatching { file.readText(Charsets.UTF_8) }.getOrNull() ?: return null
                return runCatching { json.decodeFromString(GrammarMiningSnapshot.serializer(), text) }.getOrNull()
            }

            parseOrNull(f)
                ?: parseOrNull(snapshotBakFile())
                ?: parseOrNull(legacyTmpFile())
                ?: GrammarMiningSnapshot(updatedAt = isoNowUtc())
        }

    suspend fun saveSnapshot(snapshot: GrammarMiningSnapshot) =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            dir.mkdirs()
            val target = snapshotFile()
            val content = json.encodeToString(GrammarMiningSnapshot.serializer(), snapshot)
            writeMutex.withLock { atomicWriteUtf8(target, content) }
        }

    suspend fun clear() =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            if (dir.exists()) dir.deleteRecursively()
        }

    companion object {
        fun isoNowUtc(): String {
            val fmt =
                SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
            return fmt.format(Date())
        }
    }
}

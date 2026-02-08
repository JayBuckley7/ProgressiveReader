package com.progressivereader.kmp.jpdbMirror

import android.content.Context
import com.progressivereader.kmp.core.atomicWriteUtf8
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class JpdbMirrorStore(context: Context) {
    private val appContext = context.applicationContext
    private val writeMutex = Mutex()

    private val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            prettyPrint = true
        }

    private fun rootDir(): File = File(appContext.filesDir, "jpdb_mirror")
    private fun snapshotFile(): File = File(rootDir(), "jpdb_mirror_v1.json")
    private fun snapshotBakFile(): File = File(rootDir(), "jpdb_mirror_v1.json.bak")
    private fun legacyTmpFile(): File = File(rootDir(), "jpdb_mirror_v1.json.tmp")

    suspend fun loadSnapshot(): JpdbMirrorSnapshot? =
        withContext(Dispatchers.IO) {
            val f = snapshotFile()
            fun parseOrNull(file: File): JpdbMirrorSnapshot? {
                if (!file.exists()) return null
                val text = runCatching { file.readText(Charsets.UTF_8) }.getOrNull() ?: return null
                return runCatching { json.decodeFromString(JpdbMirrorSnapshot.serializer(), text) }.getOrNull()
            }

            parseOrNull(f) ?: parseOrNull(snapshotBakFile()) ?: parseOrNull(legacyTmpFile())
        }

    suspend fun saveSnapshot(snapshot: JpdbMirrorSnapshot) =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            dir.mkdirs()
            val target = snapshotFile()
            val content = json.encodeToString(JpdbMirrorSnapshot.serializer(), snapshot)
            writeMutex.withLock { atomicWriteUtf8(target, content) }
        }

    suspend fun clear() =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            if (dir.exists()) dir.deleteRecursively()
        }
}

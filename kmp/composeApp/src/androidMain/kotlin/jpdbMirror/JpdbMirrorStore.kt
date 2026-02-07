package com.progressivereader.kmp.jpdbMirror

import android.content.Context
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class JpdbMirrorStore(context: Context) {
    private val appContext = context.applicationContext

    private val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            prettyPrint = true
        }

    private fun rootDir(): File = File(appContext.filesDir, "jpdb_mirror")
    private fun snapshotFile(): File = File(rootDir(), "jpdb_mirror_v1.json")

    suspend fun loadSnapshot(): JpdbMirrorSnapshot? =
        withContext(Dispatchers.IO) {
            val f = snapshotFile()
            if (!f.exists()) return@withContext null
            runCatching { json.decodeFromString(JpdbMirrorSnapshot.serializer(), f.readText()) }.getOrNull()
        }

    suspend fun saveSnapshot(snapshot: JpdbMirrorSnapshot) =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            dir.mkdirs()
            val target = snapshotFile()
            val tmp = File(dir, "${target.name}.tmp")
            tmp.writeText(json.encodeToString(JpdbMirrorSnapshot.serializer(), snapshot))
            if (!tmp.renameTo(target)) {
                target.writeText(tmp.readText())
                tmp.delete()
            }
        }

    suspend fun clear() =
        withContext(Dispatchers.IO) {
            val dir = rootDir()
            if (dir.exists()) dir.deleteRecursively()
        }
}


package com.progressivereader.kmp.offline

import android.content.Context
import java.io.File

class DriveCoverCache(context: Context) {
    private val appContext = context.applicationContext
    private val rootDir: File = File(appContext.cacheDir, "drive_covers")

    fun coverFile(fileId: String): File {
        rootDir.mkdirs()
        return File(rootDir, "$fileId.jpg")
    }

    fun existingCoverFile(fileId: String): File? {
        val f = coverFile(fileId)
        return f.takeIf { it.exists() && it.isFile && it.length() > 0 }
    }

    fun clearAll() {
        if (rootDir.exists()) rootDir.deleteRecursively()
    }
}


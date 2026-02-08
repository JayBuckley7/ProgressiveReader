package com.progressivereader.kmp.adapters

import android.content.Context
import com.progressivereader.kmp.offline.DriveCoverCache
import com.progressivereader.kmp.ports.CoverCachePort

class AndroidCoverCachePort(
    context: Context,
) : CoverCachePort {
    private val cache = DriveCoverCache(context.applicationContext)

    override fun coverPath(fileId: String): String = cache.coverFile(fileId).absolutePath

    override fun existingCoverPath(fileId: String): String? = cache.existingCoverFile(fileId)?.absolutePath

    override fun deleteCover(fileId: String) {
        runCatching { cache.coverFile(fileId).delete() }
    }
}


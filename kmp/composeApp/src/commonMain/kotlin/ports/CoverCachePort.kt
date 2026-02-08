package com.progressivereader.kmp.ports

interface CoverCachePort {
    fun coverPath(fileId: String): String

    fun existingCoverPath(fileId: String): String?

    fun deleteCover(fileId: String)
}


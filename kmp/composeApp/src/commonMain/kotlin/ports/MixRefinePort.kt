package com.progressivereader.kmp.ports

interface MixRefinePort {
    suspend fun loadLatestChoices(
        bookId: String,
        chapterIndex: Int,
    ): Map<String, String?>

    suspend fun loadChoices(
        bookId: String,
        cacheKey: String,
    ): Map<String, String?>?

    suspend fun saveChoices(
        bookId: String,
        cacheKey: String,
        choices: Map<String, String?>,
    )

    suspend fun setLatest(
        bookId: String,
        chapterIndex: Int,
        cacheKey: String,
    )

    suspend fun clearLatest(
        bookId: String,
        chapterIndex: Int,
    )
}


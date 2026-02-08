package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.mix.MixRefineStore
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.ports.MixRefinePort

class AndroidMixRefinePort(
    private val bookCache: BookCache,
) : MixRefinePort {
    private val storeByBookId = HashMap<String, MixRefineStore>()

    private fun storeFor(bookId: String): MixRefineStore =
        storeByBookId.getOrPut(bookId) { MixRefineStore(bookCache.bookDir(bookId)) }

    override suspend fun loadLatestChoices(bookId: String, chapterIndex: Int): Map<String, String?> =
        storeFor(bookId).loadLatestChoices(chapterIndex)

    override suspend fun loadChoices(bookId: String, cacheKey: String): Map<String, String?>? =
        storeFor(bookId).loadChoices(cacheKey)

    override suspend fun saveChoices(bookId: String, cacheKey: String, choices: Map<String, String?>) {
        storeFor(bookId).saveChoices(cacheKey, choices)
    }

    override suspend fun setLatest(bookId: String, chapterIndex: Int, cacheKey: String) {
        storeFor(bookId).setLatest(chapterIndex, cacheKey)
    }

    override suspend fun clearLatest(bookId: String, chapterIndex: Int) {
        storeFor(bookId).clearLatest(chapterIndex)
    }
}


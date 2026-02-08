package com.progressivereader.kmp.ports

data class JpdbUpdateWordStateResult(
    val success: Boolean,
    val newState: List<String>? = null,
)

data class JpdbReviewCardResult(
    val success: Boolean,
    val newState: List<String>? = null,
)

interface JpdbActionsPort {
    suspend fun mineWord(
        vid: Int,
        sid: Int,
        jpdbApiKey: String,
        miningDeckId: Int? = null,
    ): Boolean

    suspend fun updateWordState(
        vid: Int,
        sid: Int,
        flag: String,
        state: Boolean,
        jpdbApiKey: String,
    ): JpdbUpdateWordStateResult?

    suspend fun reviewCard(
        vid: Int,
        sid: Int,
        rating: String,
        jpdbApiKey: String,
    ): JpdbReviewCardResult?
}


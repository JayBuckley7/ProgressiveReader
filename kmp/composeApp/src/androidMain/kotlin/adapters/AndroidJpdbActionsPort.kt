package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.jpdb.JpdbActionsService
import com.progressivereader.kmp.ports.JpdbActionsPort
import com.progressivereader.kmp.ports.JpdbReviewCardResult
import com.progressivereader.kmp.ports.JpdbUpdateWordStateResult

class AndroidJpdbActionsPort(
    private val getSessionJwt: () -> String?,
) : JpdbActionsPort {
    private val service = JpdbActionsService(getSessionToken = getSessionJwt)

    override suspend fun mineWord(
        vid: Int,
        sid: Int,
        jpdbApiKey: String,
        miningDeckId: Int?,
    ): Boolean =
        service
            .mineWord(
                JpdbActionsService.MineWordRequest(
                    vid = vid,
                    sid = sid,
                    jpdbApiKey = jpdbApiKey,
                    miningDeckId = miningDeckId,
                ),
            )?.success == true

    override suspend fun updateWordState(
        vid: Int,
        sid: Int,
        flag: String,
        state: Boolean,
        jpdbApiKey: String,
    ): JpdbUpdateWordStateResult? {
        val res =
            service.updateWordState(
                JpdbActionsService.UpdateWordStateRequest(
                    vid = vid,
                    sid = sid,
                    flag = flag,
                    state = state,
                    jpdbApiKey = jpdbApiKey,
                ),
            ) ?: return null

        return JpdbUpdateWordStateResult(
            success = res.success,
            newState = res.newState,
        )
    }

    override suspend fun reviewCard(
        vid: Int,
        sid: Int,
        rating: String,
        jpdbApiKey: String,
    ): JpdbReviewCardResult? {
        val res =
            service.reviewCard(
                JpdbActionsService.ReviewCardRequest(
                    vid = vid,
                    sid = sid,
                    rating = rating,
                    jpdbApiKey = jpdbApiKey,
                ),
            ) ?: return null

        return JpdbReviewCardResult(
            success = res.success,
            newState = res.newState,
        )
    }
}


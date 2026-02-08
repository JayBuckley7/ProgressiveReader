package com.progressivereader.kmp.ports

import com.progressivereader.kmp.mix.MixRefineCandidate

/**
 * Port for AI-backed workflows (OpenAI, etc).
 *
 * Only adapters should perform HTTP calls.
 */
interface AiPort {
    suspend fun refineAmbiguousMixSwaps(
        openAiKey: String,
        model: String,
        textSample: String,
        ambiguousKeys: List<String>,
        candidatesByKey: Map<String, List<MixRefineCandidate>>,
    ): Map<String, String?> // glossKey -> vocabId (vid/sid) or null
}


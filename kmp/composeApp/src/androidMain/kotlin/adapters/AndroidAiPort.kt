package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.mix.MixRefineCandidate
import com.progressivereader.kmp.mix.refineAmbiguousSwaps
import com.progressivereader.kmp.ports.AiPort

class AndroidAiPort : AiPort {
    override suspend fun refineAmbiguousMixSwaps(
        openAiKey: String,
        model: String,
        textSample: String,
        ambiguousKeys: List<String>,
        candidatesByKey: Map<String, List<MixRefineCandidate>>,
    ): Map<String, String?> =
        refineAmbiguousSwaps(
            openAiKey = openAiKey,
            model = model,
            textSample = textSample,
            ambiguousKeys = ambiguousKeys,
            candidatesByKey = candidatesByKey,
        )
}


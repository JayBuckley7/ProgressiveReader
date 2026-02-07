package com.progressivereader.kmp.jpdbMirror

private fun rankOrInf(rank: Int?): Int = rank ?: Int.MAX_VALUE

fun buildGlossIndexRows(records: List<JpdbKnownVocabRecord>, builtAtMs: Long): List<JpdbGlossIndexRow> {
    data class Candidate(
        val id: JpdbVocabId,
        val frequencyRank: Int?,
        val spellingLen: Int,
        val record: JpdbKnownVocabRecord,
    )

    val byGloss = LinkedHashMap<String, MutableList<Candidate>>()

    for (record in records) {
        val glosses = extractEnglishNounGlosses(record.meanings).take(10)
        for (gloss in glosses) {
            val list = byGloss.getOrPut(gloss) { ArrayList() }
            list.add(
                Candidate(
                    id = record.id,
                    frequencyRank = record.frequencyRank,
                    spellingLen = record.spelling.length,
                    record = record,
                )
            )
        }
    }

    val rows = ArrayList<JpdbGlossIndexRow>(byGloss.size)

    for ((gloss, candidates) in byGloss) {
        // De-duplicate by id (should be rare but possible if meanings overlap weirdly).
        val bestById = LinkedHashMap<JpdbVocabId, Candidate>()
        for (c in candidates) {
            val existing = bestById[c.id]
            if (existing == null) {
                bestById[c.id] = c
            } else {
                val existingRank = rankOrInf(existing.frequencyRank)
                val nextRank = rankOrInf(c.frequencyRank)
                if (nextRank < existingRank) bestById[c.id] = c
                else if (nextRank == existingRank && c.spellingLen > existing.spellingLen) bestById[c.id] = c
            }
        }

        val deduped = bestById.values.toMutableList()
        deduped.sortWith(
            compareBy<Candidate> { rankOrInf(it.frequencyRank) }
                .thenByDescending { it.spellingLen }
                .thenBy { it.id }
        )

        rows.add(
            JpdbGlossIndexRow(
                gloss = gloss,
                candidateIds = deduped.map { it.id },
                builtAtMs = builtAtMs,
            )
        )
    }

    return rows
}


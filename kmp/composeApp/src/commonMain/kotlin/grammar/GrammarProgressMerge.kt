package com.progressivereader.kmp.grammar

import kotlinx.serialization.Serializable

@Serializable
data class GrammarProgressChange(val state: String, val revision: String)

/** Explicit local removals override cloud values until that exact edit is acknowledged. */
fun mergeGrammarProgress(
    known: Set<String>,
    learning: Set<String>,
    changes: Map<String, GrammarProgressChange>,
): Pair<Set<String>, Set<String>> {
    val nextKnown = known.toMutableSet()
    val nextLearning = (learning - known).toMutableSet()
    changes.forEach { (id, change) ->
        nextKnown.remove(id)
        nextLearning.remove(id)
        when (change.state) {
            "known" -> nextKnown.add(id)
            "learning" -> nextLearning.add(id)
            "none" -> Unit
            else -> error("Invalid pending grammar state")
        }
    }
    return nextKnown to nextLearning
}

fun remainingGrammarChanges(
    current: Map<String, GrammarProgressChange>,
    acknowledged: Map<String, GrammarProgressChange>,
): Map<String, GrammarProgressChange> = current.filter { (id, change) -> acknowledged[id] != change }

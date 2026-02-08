package com.progressivereader.kmp.grammar

data class GrammarState(
    val underlinesEnabled: Boolean = true,
    val miningEnabled: Boolean = true,
    // Persisted open/closed state for JLPT level sections (e.g. {"n5","n4"}). Can be empty (all collapsed).
    val openLevels: Set<String> = setOf(GrammarLevel.N5.id),
    val learningIds: Set<String> = emptySet(),
    val knownIds: Set<String> = emptySet(),
)


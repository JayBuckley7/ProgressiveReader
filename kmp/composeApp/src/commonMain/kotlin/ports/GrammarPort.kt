package com.progressivereader.kmp.ports

import com.progressivereader.kmp.grammar.GrammarState
import kotlinx.coroutines.flow.Flow

interface GrammarPort {
    val stateFlow: Flow<GrammarState>
}


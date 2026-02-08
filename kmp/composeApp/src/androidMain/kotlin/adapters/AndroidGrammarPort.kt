package com.progressivereader.kmp.adapters

import android.content.Context
import com.progressivereader.kmp.grammar.GrammarStore
import com.progressivereader.kmp.grammar.GrammarState
import com.progressivereader.kmp.ports.GrammarPort
import kotlinx.coroutines.flow.Flow

class AndroidGrammarPort(
    context: Context,
) : GrammarPort {
    private val store = GrammarStore(context.applicationContext)

    override val stateFlow: Flow<GrammarState> = store.stateFlow
}


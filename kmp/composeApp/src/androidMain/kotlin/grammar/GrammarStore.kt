package com.progressivereader.kmp.grammar

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.grammarDataStore by preferencesDataStore(name = "grammar_state")

data class GrammarState(
    val underlinesEnabled: Boolean = true,
    val learningIds: Set<String> = emptySet(),
    val knownIds: Set<String> = emptySet(),
)

class GrammarStore(private val context: Context) {
    private object Keys {
        val underlinesEnabled = booleanPreferencesKey("underlines_enabled")
        val learningIds = stringSetPreferencesKey("learning_ids")
        val knownIds = stringSetPreferencesKey("known_ids")
    }

    val stateFlow: Flow<GrammarState> =
        context.grammarDataStore.data.map { prefs -> prefs.toGrammarState() }

    suspend fun setUnderlinesEnabled(enabled: Boolean) {
        context.grammarDataStore.edit { it[Keys.underlinesEnabled] = enabled }
    }

    suspend fun setLearning(id: String, enabled: Boolean) {
        val key = id.trim()
        if (key.isBlank()) return
        context.grammarDataStore.edit { prefs ->
            val learning = (prefs[Keys.learningIds] ?: emptySet()).toMutableSet()
            val known = (prefs[Keys.knownIds] ?: emptySet()).toMutableSet()
            if (enabled) {
                learning.add(key)
                known.remove(key)
            } else {
                learning.remove(key)
            }
            prefs[Keys.learningIds] = learning
            prefs[Keys.knownIds] = known
        }
    }

    suspend fun setKnown(id: String, enabled: Boolean) {
        val key = id.trim()
        if (key.isBlank()) return
        context.grammarDataStore.edit { prefs ->
            val learning = (prefs[Keys.learningIds] ?: emptySet()).toMutableSet()
            val known = (prefs[Keys.knownIds] ?: emptySet()).toMutableSet()
            if (enabled) {
                known.add(key)
                learning.remove(key)
            } else {
                known.remove(key)
            }
            prefs[Keys.learningIds] = learning
            prefs[Keys.knownIds] = known
        }
    }

    suspend fun clearAll() {
        context.grammarDataStore.edit {
            it.remove(Keys.learningIds)
            it.remove(Keys.knownIds)
        }
    }

    private fun Preferences.toGrammarState(): GrammarState =
        GrammarState(
            underlinesEnabled = this[Keys.underlinesEnabled] ?: true,
            learningIds = this[Keys.learningIds] ?: emptySet(),
            knownIds = this[Keys.knownIds] ?: emptySet(),
        )
}


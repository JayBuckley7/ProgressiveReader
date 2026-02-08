package com.progressivereader.kmp.grammar

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.progressivereader.kmp.grammar.GrammarLevel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.grammarDataStore by preferencesDataStore(name = "grammar_state")

class GrammarStore(private val context: Context) {
    private object Keys {
        val underlinesEnabled = booleanPreferencesKey("underlines_enabled")
        val miningEnabled = booleanPreferencesKey("mining_enabled")
        val openLevels = stringSetPreferencesKey("open_levels")
        val learningIds = stringSetPreferencesKey("learning_ids")
        val knownIds = stringSetPreferencesKey("known_ids")
    }

    val stateFlow: Flow<GrammarState> =
        context.grammarDataStore.data.map { prefs -> prefs.toGrammarState() }

    suspend fun setUnderlinesEnabled(enabled: Boolean) {
        context.grammarDataStore.edit { it[Keys.underlinesEnabled] = enabled }
    }

    suspend fun setMiningEnabled(enabled: Boolean) {
        context.grammarDataStore.edit { it[Keys.miningEnabled] = enabled }
    }

    suspend fun toggleLevelOpen(levelId: String) {
        val key = levelId.trim().lowercase()
        if (key.isBlank()) return
        context.grammarDataStore.edit { prefs ->
            val open = (prefs[Keys.openLevels] ?: setOf(GrammarLevel.N5.id)).toMutableSet()
            if (open.contains(key)) open.remove(key) else {
                open.add(key)
            }
            prefs[Keys.openLevels] = open
        }
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

    suspend fun setKnownMany(ids: List<String>, enabled: Boolean) {
        val keys =
            ids.map { it.trim() }
                .filter { it.isNotBlank() }
                .distinct()
        if (keys.isEmpty()) return

        context.grammarDataStore.edit { prefs ->
            val learning = (prefs[Keys.learningIds] ?: emptySet()).toMutableSet()
            val known = (prefs[Keys.knownIds] ?: emptySet()).toMutableSet()

            for (id in keys) {
                if (enabled) {
                    known.add(id)
                    learning.remove(id)
                } else {
                    known.remove(id)
                }
            }

            prefs[Keys.learningIds] = learning
            prefs[Keys.knownIds] = known
        }
    }

    suspend fun replaceProgress(
        knownIds: Set<String>,
        learningIds: Set<String>,
    ) {
        val known =
            knownIds.map { it.trim() }
                .filter { it.isNotBlank() }
                .toSet()
        val learningRaw =
            learningIds.map { it.trim() }
                .filter { it.isNotBlank() }
                .toSet()
        val learning = learningRaw.filter { !known.contains(it) }.toSet()

        context.grammarDataStore.edit { prefs ->
            prefs[Keys.knownIds] = known
            prefs[Keys.learningIds] = learning
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
            miningEnabled = this[Keys.miningEnabled] ?: true,
            // Default to N5 open when unset; allow empty set when user collapses all.
            openLevels = this[Keys.openLevels] ?: setOf(GrammarLevel.N5.id),
            learningIds = this[Keys.learningIds] ?: emptySet(),
            knownIds = this[Keys.knownIds] ?: emptySet(),
        )
}

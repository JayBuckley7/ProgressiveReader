package com.progressivereader.kmp.grammar

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.MutablePreferences
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import java.util.UUID
import com.progressivereader.kmp.session.AccountStorage
import com.progressivereader.kmp.grammar.GrammarLevel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map



class GrammarStore(private val context: Context) {
    private val dataStore = AccountStorage.preferences(context, "grammar_state")
    private object Keys {
        val underlinesEnabled = booleanPreferencesKey("underlines_enabled")
        val miningEnabled = booleanPreferencesKey("mining_enabled")
        val openLevels = stringSetPreferencesKey("open_levels")
        val learningIds = stringSetPreferencesKey("learning_ids")
        val knownIds = stringSetPreferencesKey("known_ids")
        val pending = stringPreferencesKey("pending_changes")
        val initialized = booleanPreferencesKey("cloud_progress_initialized")
    }

    val stateFlow: Flow<GrammarState> =
        dataStore.data.map { prefs -> prefs.toGrammarState() }

    suspend fun setUnderlinesEnabled(enabled: Boolean) {
        dataStore.edit { it[Keys.underlinesEnabled] = enabled }
    }

    suspend fun setMiningEnabled(enabled: Boolean) {
        dataStore.edit { it[Keys.miningEnabled] = enabled }
    }

    suspend fun toggleLevelOpen(levelId: String) {
        val key = levelId.trim().lowercase()
        if (key.isBlank()) return
        dataStore.edit { prefs ->
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
        dataStore.edit { prefs ->
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
            prefs.recordChanges(setOf(key))
        }
    }

    suspend fun setKnown(id: String, enabled: Boolean) {
        val key = id.trim()
        if (key.isBlank()) return
        dataStore.edit { prefs ->
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
            prefs.recordChanges(setOf(key))
        }
    }

    suspend fun setKnownMany(ids: List<String>, enabled: Boolean) {
        val keys =
            ids.map { it.trim() }
                .filter { it.isNotBlank() }
                .distinct()
        if (keys.isEmpty()) return

        dataStore.edit { prefs ->
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
            prefs.recordChanges(keys.toSet())
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

        dataStore.edit { prefs ->
            prefs[Keys.knownIds] = known
            prefs[Keys.learningIds] = learning
        }
    }

    suspend fun clearAll() {
        dataStore.edit {
            val ids = it[Keys.learningIds].orEmpty() + it[Keys.knownIds].orEmpty()
            it.remove(Keys.learningIds)
            it.remove(Keys.knownIds)
            it.recordChanges(ids)
        }
    }

    private fun Preferences.pending(): Map<String, GrammarProgressChange> =
        this[Keys.pending]?.let { Json.decodeFromString<Map<String, GrammarProgressChange>>(it) }.orEmpty()

    private fun MutablePreferences.recordChanges(ids: Set<String>) {
        val pending = pending().toMutableMap()
        for (id in ids) pending[id] = GrammarProgressChange(
            when (id) { in this[Keys.knownIds].orEmpty() -> "known"; in this[Keys.learningIds].orEmpty() -> "learning"; else -> "none" },
            UUID.randomUUID().toString(),
        )
        this[Keys.pending] = Json.encodeToString(pending)
    }

    suspend fun mergeCloudProgress(known: Set<String>, learning: Set<String>) {
        dataStore.edit { prefs ->
            // Preserve pre-upgrade local progress once; subsequent cloud reads respect cloud removals.
            if (prefs[Keys.initialized] != true) {
                val existingPending = prefs.pending()
                prefs.recordChanges((prefs[Keys.knownIds].orEmpty() + prefs[Keys.learningIds].orEmpty()) - existingPending.keys)
                prefs[Keys.initialized] = true
            }
            val merged = mergeGrammarProgress(known, learning, prefs.pending())
            prefs[Keys.knownIds] = merged.first
            prefs[Keys.learningIds] = merged.second
        }
    }

    suspend fun acknowledge(changes: Map<String, GrammarProgressChange>) {
        dataStore.edit { prefs -> prefs[Keys.pending] = Json.encodeToString(remainingGrammarChanges(prefs.pending(), changes)) }
    }

    private fun Preferences.toGrammarState(): GrammarState =
        GrammarState(
            underlinesEnabled = this[Keys.underlinesEnabled] ?: true,
            miningEnabled = this[Keys.miningEnabled] ?: true,
            // Default to N5 open when unset; allow empty set when user collapses all.
            openLevels = this[Keys.openLevels] ?: setOf(GrammarLevel.N5.id),
            learningIds = this[Keys.learningIds] ?: emptySet(),
            knownIds = this[Keys.knownIds] ?: emptySet(),
            pendingChanges = pending(),
        )
}

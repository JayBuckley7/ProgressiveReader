package com.progressivereader.kmp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.jpdb.JpdbActionsService
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.vocabulary.Deck
import com.progressivereader.kmp.vocabulary.JpdbLookupEntry
import com.progressivereader.kmp.vocabulary.JpdbVocabPair
import com.progressivereader.kmp.vocabulary.VocabularyService
import com.progressivereader.kmp.vocabulary.VocabularyWord
import java.util.Calendar
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

private enum class TabKey {
    Due,
    Deck,
    Saved,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VocabularyScreen(
    settings: AppSettings,
    sessionJwt: String?,
    onOpenLogin: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val isOnline = rememberIsOnline()

    val jpdbApiKey = settings.reader.jpdbApiKey?.trim().orEmpty()
    val hasJpdbKey = jpdbApiKey.isNotBlank()
    val isSignedIn = !sessionJwt.isNullOrBlank()

    val service = androidx.compose.runtime.remember(sessionJwt) { VocabularyService(getSessionToken = { sessionJwt }) }
    val jpdbActions = androidx.compose.runtime.remember(sessionJwt) { JpdbActionsService(getSessionToken = { sessionJwt }) }

    var tab by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(TabKey.Due) }

    var decks by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<List<Deck>>(emptyList()) }
    var decksLoading by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var decksError by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }

    var selectedDeckId by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }

    var deckPairs by androidx.compose.runtime.remember(selectedDeckId) { androidx.compose.runtime.mutableStateOf<List<JpdbVocabPair>>(emptyList()) }
    var deckEntries by androidx.compose.runtime.remember(selectedDeckId) { androidx.compose.runtime.mutableStateOf<List<JpdbLookupEntry>>(emptyList()) }
    var deckLoading by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var deckError by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }

    data class DueProgress(val phase: String, val loaded: Int, val total: Int)
    var dueEntries by androidx.compose.runtime.remember(selectedDeckId) { androidx.compose.runtime.mutableStateOf<List<JpdbLookupEntry>>(emptyList()) }
    var dueLoading by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var dueError by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }
    var dueProgress by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<DueProgress?>(null) }

    var savedWords by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<List<VocabularyWord>>(emptyList()) }
    var savedLoading by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var savedError by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }

    fun normalizeEpochMs(value: Long?): Long? {
        if (value == null || value <= 0) return null
        return when {
            value > 100_000_000_000_000L -> value / 1000 // microseconds
            value > 100_000_000_000L -> value // milliseconds
            else -> value * 1000 // seconds
        }
    }

    fun cardStateStrings(raw: JsonElement?): List<String> =
        when (raw) {
            is JsonPrimitive -> listOf(raw.content)
            is JsonArray ->
                raw.mapNotNull { (it as? JsonPrimitive)?.content }
            else -> emptyList()
        }

    fun isDue(entry: JpdbLookupEntry, nowMs: Long): Boolean {
        val dueAt = normalizeEpochMs(entry.dueAt)
        if (dueAt != null) return dueAt <= nowMs
        return cardStateStrings(entry.cardStateRaw).any { it.contains("due", ignoreCase = true) }
    }

    data class DueGroup(val key: String, val label: String, val entries: List<JpdbLookupEntry>)

    fun groupDue(entries: List<JpdbLookupEntry>): List<DueGroup> {
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        val startOfToday = cal.timeInMillis
        cal.add(Calendar.DAY_OF_YEAR, 1)
        val startOfTomorrow = cal.timeInMillis
        cal.add(Calendar.DAY_OF_YEAR, 1)
        val startOfDayAfter = cal.timeInMillis
        val weekWindow = startOfToday + 7L * 24L * 60L * 60L * 1000L

        val buckets = linkedMapOf(
            "overdue" to mutableListOf<JpdbLookupEntry>(),
            "today" to mutableListOf(),
            "tomorrow" to mutableListOf(),
            "week" to mutableListOf(),
            "later" to mutableListOf(),
            "none" to mutableListOf(),
        )

        for (e in entries) {
            val dueAt = normalizeEpochMs(e.dueAt)
            when {
                dueAt == null -> buckets.getValue("none").add(e)
                dueAt < startOfToday -> buckets.getValue("overdue").add(e)
                dueAt < startOfTomorrow -> buckets.getValue("today").add(e)
                dueAt < startOfDayAfter -> buckets.getValue("tomorrow").add(e)
                dueAt < weekWindow -> buckets.getValue("week").add(e)
                else -> buckets.getValue("later").add(e)
            }
        }

        val labels =
            mapOf(
                "overdue" to "Overdue",
                "today" to "Due today",
                "tomorrow" to "Due tomorrow",
                "week" to "Due this week",
                "later" to "Later",
                "none" to "No due date",
            )

        return buckets.entries
            .mapNotNull { (key, list) ->
                if (list.isEmpty()) return@mapNotNull null
                val sorted =
                    list.sortedWith(
                        compareBy<JpdbLookupEntry> { normalizeEpochMs(it.dueAt) ?: Long.MAX_VALUE }
                            .thenBy { it.spelling.orEmpty() }
                    )
                DueGroup(key = key, label = labels.getValue(key), entries = sorted)
            }
    }

    suspend fun refreshDecks() {
        if (!isSignedIn || !hasJpdbKey || !isOnline) return
        decksLoading = true
        decksError = null
        try {
            val loaded = service.listUserDecks(jpdbApiKey)
            decks = loaded.sortedBy { it.name.lowercase() }
            if (selectedDeckId == null) {
                selectedDeckId = loaded.firstOrNull()?.id
            }
        } catch (t: Throwable) {
            decksError = t.message ?: "Failed to load decks"
        } finally {
            decksLoading = false
        }
    }

    LaunchedEffect(isSignedIn, hasJpdbKey, isOnline) {
        if (isSignedIn && hasJpdbKey && isOnline) refreshDecks()
    }

    suspend fun ensureDeckPairs(): List<JpdbVocabPair> {
        val deckId = selectedDeckId ?: return emptyList()
        if (deckPairs.isNotEmpty()) return deckPairs
        deckLoading = true
        deckError = null
        return try {
            val pairs = service.listDeckVocabulary(deckId, jpdbApiKey)
            deckPairs = pairs
            pairs
        } catch (t: Throwable) {
            deckError = t.message ?: "Failed to load deck"
            emptyList()
        } finally {
            deckLoading = false
        }
    }

    suspend fun loadDeckPage(start: Int, limit: Int = 200) {
        val deckId = selectedDeckId ?: return
        if (!isSignedIn || !hasJpdbKey || !isOnline) return
        val pairs = ensureDeckPairs()
        if (pairs.isEmpty()) return

        val chunk = pairs.drop(start).take(limit)
        if (chunk.isEmpty()) return

        deckLoading = true
        deckError = null
        try {
            val fields = listOf("spelling", "reading", "frequency_rank", "meanings", "card_state", "due_at")
            val entries = service.lookupVocabulary(chunk, fields, jpdbApiKey)
            deckEntries =
                if (start == 0) {
                    entries
                } else {
                    deckEntries + entries
                }
        } catch (t: Throwable) {
            deckError = t.message ?: "Failed to load deck vocabulary"
        } finally {
            deckLoading = false
        }
    }

    suspend fun refreshDueCards() {
        if (dueLoading) return
        if (!isSignedIn || !hasJpdbKey || !isOnline) return
        val deckId = selectedDeckId ?: return

        dueLoading = true
        dueError = null
        dueProgress = null
        try {
            val pairs = if (deckPairs.isNotEmpty()) deckPairs else service.listDeckVocabulary(deckId, jpdbApiKey).also { deckPairs = it }
            if (pairs.isEmpty()) {
                dueEntries = emptyList()
                return
            }

            val nowMs = System.currentTimeMillis()
            val duePairs = mutableListOf<JpdbVocabPair>()
            val scanFields = listOf("due_at", "card_state")
            val detailFields = listOf("spelling", "reading", "meanings", "card_state", "due_at")
            val batchSize = 400

            dueProgress = DueProgress(phase = "scan", loaded = 0, total = pairs.size)
            var i = 0
            while (i < pairs.size) {
                val chunk = pairs.subList(i, minOf(i + batchSize, pairs.size))
                val scan = service.lookupVocabulary(chunk, scanFields, jpdbApiKey)
                scan.forEach { e -> if (isDue(e, nowMs)) duePairs.add(JpdbVocabPair(e.vid, e.sid)) }
                i += batchSize
                dueProgress = DueProgress(phase = "scan", loaded = minOf(i, pairs.size), total = pairs.size)
                delay(120)
            }

            if (duePairs.isEmpty()) {
                dueEntries = emptyList()
                return
            }

            val details = mutableListOf<JpdbLookupEntry>()
            dueProgress = DueProgress(phase = "details", loaded = 0, total = duePairs.size)
            i = 0
            while (i < duePairs.size) {
                val chunk = duePairs.subList(i, minOf(i + batchSize, duePairs.size))
                details.addAll(service.lookupVocabulary(chunk, detailFields, jpdbApiKey))
                i += batchSize
                dueProgress = DueProgress(phase = "details", loaded = minOf(i, duePairs.size), total = duePairs.size)
                delay(120)
            }

            dueEntries = details.sortedBy { normalizeEpochMs(it.dueAt) ?: Long.MAX_VALUE }
        } catch (t: Throwable) {
            dueError = t.message ?: "Failed to refresh due cards"
        } finally {
            dueLoading = false
            dueProgress = null
        }
    }

    suspend fun refreshSaved() {
        if (!isSignedIn) return
        savedLoading = true
        savedError = null
        try {
            savedWords = service.getUserVocabulary()
        } catch (t: Throwable) {
            savedError = t.message ?: "Failed to load saved vocabulary"
        } finally {
            savedLoading = false
        }
    }

    Scaffold(
        topBar = {
            AppShellTopBar(
                title = "Vocabulary",
                subtitle = "Due cards, deck lookups, and saved study items.",
                actions = {
                    if (sessionJwt.isNullOrBlank()) {
                        AppShellAction(icon = Icons.Outlined.Login, contentDescription = "Sign in", onClick = onOpenLogin)
                    }
                },
            )
        },
        bottomBar = { bottomBar?.invoke() },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (!isOnline) {
                AppCard(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Offline", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                        AppMutedText("Connect to the internet to fetch JPDB decks and due cards.")
                    }
                }
            } else if (!isSignedIn) {
                AppCard(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Sign in required", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                        AppMutedText("Vocabulary features require a Clerk session.")
                        AppPrimaryButton(text = "Sign in", onClick = onOpenLogin)
                    }
                }
            } else if (!hasJpdbKey) {
                AppCard(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("JPDB key missing", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                        AppMutedText("Add a JPDB API key in Settings to use decks and due cards.")
                    }
                }
            } else {
                val tabs = listOf("Due", "Deck", "Saved")
                TabRow(selectedTabIndex = tab.ordinal) {
                    tabs.forEachIndexed { idx, label ->
                        Tab(
                            selected = tab.ordinal == idx,
                            onClick = {
                                tab = TabKey.values()[idx]
                                if (tab == TabKey.Saved && savedWords.isEmpty()) {
                                    scope.launch { refreshSaved() }
                                }
                            },
                            text = { Text(label) },
                        )
                    }
                }

                Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (decksLoading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    decksError?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }

                    if (decks.isEmpty() && !decksLoading) {
                        AppMutedText("No decks found.")
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            AppChip(text = "Deck")
                            val selectedName = decks.firstOrNull { it.id == selectedDeckId }?.name ?: "Select…"
                            Text(
                                selectedName,
                                modifier =
                                    Modifier
                                        .weight(1f)
                                        .clickable {
                                            // Cycle through decks for now; replace with dropdown in next pass.
                                            val idx = decks.indexOfFirst { it.id == selectedDeckId }
                                            val next = decks.getOrNull(idx + 1) ?: decks.firstOrNull()
                                            selectedDeckId = next?.id
                                            deckPairs = emptyList()
                                            deckEntries = emptyList()
                                            dueEntries = emptyList()
                                        },
                                maxLines = 1,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            )
                            AppOutlineButton(text = "Refresh decks", onClick = { scope.launch { refreshDecks() } })
                        }
                    }

                    when (tab) {
                        TabKey.Due -> {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AppPrimaryButton(
                                    text = if (dueLoading) "Refreshing…" else "Refresh due",
                                    enabled = !dueLoading && selectedDeckId != null,
                                    onClick = { scope.launch { refreshDueCards() } },
                                    modifier = Modifier.weight(1f),
                                )
                                AppOutlineButton(
                                    text = "Clear",
                                    enabled = !dueLoading && dueEntries.isNotEmpty(),
                                    onClick = { dueEntries = emptyList() },
                                )
                            }

                            dueProgress?.let { p ->
                                AppMutedText("${p.phase}: ${p.loaded} / ${p.total}")
                                LinearProgressIndicator(
                                    progress = { if (p.total == 0) 0f else p.loaded.toFloat() / p.total.toFloat() },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }

                            dueError?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }

                            val groups = groupDue(dueEntries)
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                if (groups.isEmpty() && !dueLoading) {
                                    item { AppMutedText("No due cards loaded yet.") }
                                }

                                groups.forEach { group ->
                                    item { AppSectionTitle(group.label) }
                                    items(group.entries, key = { "${it.vid}/${it.sid}" }) { entry ->
                                        VocabEntryCard(
                                            entry = entry,
                                            onReviewGood = {
                                                scope.launch {
                                                    val res =
                                                        jpdbActions.reviewCard(
                                                            JpdbActionsService.ReviewCardRequest(
                                                                vid = entry.vid,
                                                                sid = entry.sid,
                                                                rating = "good",
                                                                jpdbApiKey = jpdbApiKey,
                                                            )
                                                        )
                                                    if (res?.success == true) {
                                                        val updated =
                                                            dueEntries.map { e ->
                                                                if (e.vid == entry.vid && e.sid == entry.sid) {
                                                                    e.copy(cardStateRaw = JsonArray((res.newState ?: emptyList()).map { JsonPrimitive(it) }))
                                                                } else {
                                                                    e
                                                                }
                                                            }
                                                        dueEntries = updated
                                                    }
                                                }
                                            },
                                        )
                                    }
                                }
                            }
                        }

                        TabKey.Deck -> {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AppPrimaryButton(
                                    text = if (deckLoading) "Loading…" else "Load",
                                    enabled = !deckLoading && deckEntries.isEmpty() && selectedDeckId != null,
                                    onClick = { scope.launch { loadDeckPage(start = 0) } },
                                    modifier = Modifier.weight(1f),
                                )
                                AppOutlineButton(
                                    text = "More",
                                    enabled = !deckLoading && deckEntries.isNotEmpty(),
                                    onClick = { scope.launch { loadDeckPage(start = deckEntries.size) } },
                                )
                            }

                            deckError?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }

                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                if (deckEntries.isEmpty() && !deckLoading) {
                                    item { AppMutedText("Load a deck to browse vocabulary.") }
                                }
                                items(deckEntries, key = { "${it.vid}/${it.sid}" }) { entry ->
                                    VocabEntryCard(entry = entry, onReviewGood = null)
                                }
                            }
                        }

                        TabKey.Saved -> {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AppPrimaryButton(
                                    text = if (savedLoading) "Refreshing…" else "Refresh",
                                    enabled = !savedLoading,
                                    onClick = { scope.launch { refreshSaved() } },
                                    modifier = Modifier.weight(1f),
                                )
                            }

                            savedError?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }

                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                if (savedWords.isEmpty() && !savedLoading) {
                                    item { AppMutedText("No saved words yet.") }
                                }
                                items(savedWords, key = { it.id }) { word ->
                                    AppCard(modifier = Modifier.fillMaxWidth()) {
                                        Column(
                                            modifier = Modifier.padding(14.dp),
                                            verticalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            Text(word.word, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                                            AppMutedText(word.translation)
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                AppChip(text = if (word.mastered) "Mastered" else "Learning")
                                                AppOutlineButton(
                                                    text = if (word.mastered) "Unmaster" else "Master",
                                                    onClick = {
                                                        scope.launch {
                                                            val updated = service.toggleMastered(word.id, !word.mastered)
                                                            if (updated != null) {
                                                                savedWords = savedWords.map { if (it.id == word.id) updated else it }
                                                            }
                                                        }
                                                    },
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VocabEntryCard(
    entry: JpdbLookupEntry,
    onReviewGood: (() -> Unit)?,
) {
    AppCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(entry.spelling ?: "${entry.vid}/${entry.sid}", style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            if (!entry.reading.isNullOrBlank() && entry.reading != entry.spelling) {
                AppMutedText(entry.reading!!)
            }
            if (entry.meanings.isNotEmpty()) {
                AppMutedText(entry.meanings.take(3).joinToString("; "))
            }
            if (onReviewGood != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    AppTonalButton(text = "Review: Good", onClick = onReviewGood)
                }
            }
        }
    }
}

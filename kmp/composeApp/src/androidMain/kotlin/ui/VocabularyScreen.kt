@file:Suppress("RememberReturnType")
package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.jpdbMirror.JpdbMirrorSnapshot
import com.progressivereader.kmp.jpdbMirror.JpdbMirrorStore
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.vocabulary.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

private enum class VocabularyTab(val label: String) { Overview("Overview"), Decks("JPDB decks"), Saved("Saved words") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VocabularyScreen(
    settings: AppSettings,
    sessionJwt: String?,
    onOpenLogin: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
    embedded: Boolean = false,
) {
    val scope = rememberCoroutineScope()
    val online = rememberIsOnline()
    val currentToken = rememberUpdatedState(sessionJwt)
    val service = remember { VocabularyService { currentToken.value } }
    val context = com.progressivereader.kmp.session.LocalStorageContext.current ?: LocalContext.current.applicationContext
    val mirrorStore = remember { JpdbMirrorStore(context) }
    var mirror by remember { mutableStateOf<JpdbMirrorSnapshot?>(null) }
    var tab by remember { mutableStateOf(VocabularyTab.Overview) }
    var words by remember { mutableStateOf<List<VocabularyWord>?>(null) }
    var decks by remember { mutableStateOf<List<Deck>>(emptyList()) }
    var selectedDeck by remember { mutableStateOf<Deck?>(null) }
    var pairs by remember { mutableStateOf<List<JpdbVocabPair>>(emptyList()) }
    var entries by remember { mutableStateOf<List<JpdbLookupEntry>>(emptyList()) }
    var showDeckPicker by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val key = settings.reader.jpdbApiKey?.trim().orEmpty()
    val signedIn = !sessionJwt.isNullOrBlank()

    suspend fun perform(action: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        try { action() }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { error = failure.message ?: "Could not load cloud data. Please retry." }
        finally { busy = false }
    }
    suspend fun refreshWords() = perform { words = service.getUserVocabulary() }
    suspend fun loadDeck(deck: Deck, more: Boolean = false) = perform {
        val list = if (more) pairs else service.listDeckVocabulary(deck.id, key)
        val offset = if (more) entries.size else 0
        val page = service.lookupVocabulary(list.drop(offset).take(100), listOf("spelling", "reading", "meanings", "card_state"), key)
        selectedDeck = deck
        pairs = list
        entries = if (more) entries + page else page
    }

    LaunchedEffect(Unit) { mirror = mirrorStore.loadSnapshot() }
    LaunchedEffect(tab, signedIn, online) {
        error = null
        if (signedIn && online && tab == VocabularyTab.Saved && words == null) refreshWords()
        if (signedIn && online && tab == VocabularyTab.Decks && key.isNotBlank() && decks.isEmpty()) {
            perform { decks = service.listUserDecks(key).sortedBy { it.name.lowercase() } }
        }
    }

    if (showDeckPicker) AlertDialog(
        onDismissRequest = { showDeckPicker = false },
        title = { Text("Choose a JPDB deck") },
        text = { LazyColumn { items(decks, key = { it.id }) { deck ->
            TextButton(onClick = { showDeckPicker = false; scope.launch { loadDeck(deck) } }) { Text(deck.name) }
        } } },
        confirmButton = { TextButton(onClick = { showDeckPicker = false }) { Text("Close") } },
    )

    Scaffold(
        topBar = { if (!embedded) AppShellTopBar(title = "Vocabulary", subtitle = "Your vocabulary progress at a glance") },
        bottomBar = { bottomBar?.invoke() },
        contentWindowInsets = if (embedded) WindowInsets(0) else ScaffoldDefaults.contentWindowInsets,
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = tab.ordinal) {
                VocabularyTab.entries.forEach { item -> Tab(selected = tab == item, onClick = { tab = item }, text = { Text(item.label) }) }
            }
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
                when (tab) {
                    VocabularyTab.Overview -> {
                        item { Text("Vocabulary progress", style = MaterialTheme.typography.titleLarge) }
                        item { AppMutedText("Browse your progress here. Use Anki or JPDB for reviews.") }
                        item { AppCard { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("JPDB knowledge", style = MaterialTheme.typography.titleMedium)
                            if (mirror == null) AppMutedText("No knowledge snapshot yet. Sync JPDB in Settings to show your known words here.")
                            else {
                                Text("${mirror!!.knownVocab.size} known words", style = MaterialTheme.typography.headlineSmall)
                                AppMutedText("${mirror!!.meta.sourceDecks.size} source decks · Last synced ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(mirror!!.meta.syncedAtMs))}")
                                AppMutedText("This is the last complete snapshot, available offline.")
                            }
                        } } }
                        item { AppCard { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Saved vocabulary", style = MaterialTheme.typography.titleMedium)
                            words?.let { saved -> Text("${saved.size} saved · ${saved.count { it.mastered }} mastered") }
                                ?: AppMutedText("Open Saved words to load your separate vocabulary collection.")
                            AppOutlineButton(text = "Browse saved words", onClick = { tab = VocabularyTab.Saved })
                        } } }
                    }
                    VocabularyTab.Decks -> {
                        item {
                            when {
                                !signedIn -> { AppMutedText("Sign in to browse your JPDB decks."); AppPrimaryButton(text = "Sign in", onClick = onOpenLogin) }
                                !online -> AppMutedText("Offline. Your last knowledge snapshot is available in Overview.")
                                key.isBlank() -> AppMutedText("Add your JPDB key in Settings to browse decks.")
                                else -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    AppOutlineButton(text = selectedDeck?.name ?: "Choose deck", enabled = !busy && decks.isNotEmpty(), onClick = { showDeckPicker = true })
                                    AppOutlineButton(text = "Refresh", enabled = !busy, onClick = { scope.launch { perform { decks = service.listUserDecks(key).sortedBy { it.name.lowercase() } } } })
                                }
                            }
                        }
                        if (signedIn && online && key.isNotBlank() && decks.isEmpty() && !busy && error == null) item { AppMutedText("No JPDB decks found.") }
                        items(entries, key = { "${it.vid}/${it.sid}" }) { entry ->
                            AppCard { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(entry.spelling ?: "${entry.vid}/${entry.sid}", style = MaterialTheme.typography.titleMedium)
                                entry.reading?.let { AppMutedText(it) }
                                AppMutedText(entry.meanings.take(3).joinToString("; "))
                            } }
                        }
                        if (entries.size < pairs.size && selectedDeck != null) item {
                            AppOutlineButton(text = "Load more (${entries.size}/${pairs.size})", enabled = !busy && online, onClick = { scope.launch { loadDeck(selectedDeck!!, more = true) } })
                        }
                    }
                    VocabularyTab.Saved -> {
                        item {
                            when {
                                !signedIn -> { AppMutedText("Sign in and connect Drive to load cloud vocabulary."); AppPrimaryButton(text = "Sign in", onClick = onOpenLogin) }
                                !online -> AppMutedText("Offline. Changes cannot be confirmed with Drive.")
                                else -> AppOutlineButton(text = "Refresh saved words", enabled = !busy, onClick = { scope.launch { refreshWords() } })
                            }
                        }
                        if (words?.isEmpty() == true && error == null) item { AppMutedText("No saved vocabulary yet.") }
                        items(words.orEmpty(), key = { it.id }) { word ->
                            AppCard { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(word.word, style = MaterialTheme.typography.titleMedium)
                                AppMutedText(word.translation)
                                AppChip(if (word.mastered) "Mastered" else "Learning")
                                AppOutlineButton(text = if (word.mastered) "Mark learning" else "Mark mastered", enabled = !busy && online && signedIn, onClick = {
                                    scope.launch { perform {
                                        val updated = service.toggleMastered(word.id, !word.mastered)
                                        check(updated != null) { "Save was not confirmed. Please retry." }
                                        words = words?.map { if (it.id == word.id) updated else it }
                                    } }
                                })
                            } }
                        }
                    }
                }
            }
        }
    }
}

package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.settings.AppSettings

@Composable
fun StatsScreen(
    settings: AppSettings,
    sessionJwt: String?,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    onOpenLogin: () -> Unit,
    initialGrammar: Boolean = false,
    bottomBar: @Composable () -> Unit,
) {
    var grammar by rememberSaveable { mutableStateOf(initialGrammar) }
    Scaffold(
        topBar = { AppShellTopBar(title = "Stats", subtitle = "Vocabulary and grammar for your reading") },
        bottomBar = bottomBar,
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = if (grammar) 1 else 0) {
                Tab(selected = !grammar, onClick = { grammar = false }, text = { Text("Vocabulary") })
                Tab(selected = grammar, onClick = { grammar = true }, text = { Text("Grammar") })
            }
            Box(Modifier.weight(1f)) {
                if (grammar) GrammarScreen(settings, sessionJwt, bookCache, epubRepository, showBack = false, onBack = {}, embedded = true)
                else VocabularyScreen(settings, sessionJwt, onOpenLogin, embedded = true)
            }
        }
    }
}

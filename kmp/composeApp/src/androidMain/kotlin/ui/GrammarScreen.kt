package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.grammar.GRAMMAR_CATALOG
import com.progressivereader.kmp.grammar.GRAMMAR_LEVELS
import com.progressivereader.kmp.grammar.GrammarLevel
import com.progressivereader.kmp.grammar.GrammarPoint
import com.progressivereader.kmp.grammar.GrammarState
import com.progressivereader.kmp.grammar.GrammarStore
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GrammarScreen(
    showBack: Boolean,
    onBack: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    val appContext = LocalContext.current.applicationContext
    val store = remember { GrammarStore(appContext) }
    val state by store.stateFlow.collectAsState(initial = GrammarState())

    var query by remember { mutableStateOf("") }

    fun matches(point: GrammarPoint): Boolean {
        val q = query.trim()
        if (q.isBlank()) return true
        return point.title.contains(q, ignoreCase = true) || point.meaning.contains(q, ignoreCase = true)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                title = { Text("Grammar") },
                navigationIcon = {
                    if (showBack) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                actions = {
                    IconButton(
                        onClick = { scope.launch { store.clearAll() } },
                        enabled = state.learningIds.isNotEmpty() || state.knownIds.isNotEmpty(),
                    ) {
                        Icon(Icons.Outlined.Delete, contentDescription = "Clear grammar progress")
                    }
                },
            )
        },
        bottomBar = { bottomBar?.invoke() },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Search") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
            }

            item {
                AppCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Reader underlines", style = MaterialTheme.typography.titleSmall)
                                AppMutedText("Underline learning grammar points while JPDB highlighting is enabled.")
                            }
                            Switch(
                                checked = state.underlinesEnabled,
                                onCheckedChange = { next -> scope.launch { store.setUnderlinesEnabled(next) } },
                            )
                        }
                        AppMutedText(
                            "Learning: ${state.learningIds.size} · Known: ${state.knownIds.size}",
                        )
                    }
                }
            }

            for (level in GRAMMAR_LEVELS) {
                val label =
                    when (level) {
                        GrammarLevel.N5 -> "N5"
                        GrammarLevel.N4 -> "N4"
                        GrammarLevel.N3 -> "N3"
                        GrammarLevel.N2 -> "N2"
                        GrammarLevel.N1 -> "N1"
                    }

                val points = GRAMMAR_CATALOG[level].orEmpty().filter(::matches)
                if (points.isEmpty()) continue

                item {
                    AppSectionTitle(label)
                }

                items(points.size) { idx ->
                    val point = points[idx]
                    val isLearning = state.learningIds.contains(point.id)
                    val isKnown = state.knownIds.contains(point.id)

                    AppCard(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = point.title,
                                style = MaterialTheme.typography.titleSmall,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            AppMutedText(point.meaning)

                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                TextButton(
                                    onClick = { scope.launch { store.setLearning(point.id, enabled = !isLearning) } },
                                ) {
                                    Text(if (isLearning) "Learning ✓" else "Learning")
                                }
                                TextButton(
                                    onClick = { scope.launch { store.setKnown(point.id, enabled = !isKnown) } },
                                ) {
                                    Text(if (isKnown) "Known ✓" else "Known")
                                }
                                Spacer(Modifier.weight(1f))
                                if (point.hints.isNotEmpty()) {
                                    AppMutedText("${point.hints.size} hints")
                                }
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(8.dp)) }
            }
        }
    }
}


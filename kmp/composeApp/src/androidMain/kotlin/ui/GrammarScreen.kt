@file:Suppress("RememberReturnType") // Compose lint cannot resolve commonMain constructor return types in this KMP module.

package com.progressivereader.kmp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.drive.DriveJsonFileService
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.grammar.GRAMMAR_CATALOG
import com.progressivereader.kmp.grammar.GRAMMAR_LEVELS
import com.progressivereader.kmp.grammar.GrammarApiService
import com.progressivereader.kmp.grammar.GrammarExample
import com.progressivereader.kmp.grammar.GrammarExampleTeaching
import com.progressivereader.kmp.grammar.GrammarLevel
import com.progressivereader.kmp.grammar.GrammarMinerBudgets
import com.progressivereader.kmp.grammar.GrammarMiningSnapshot
import com.progressivereader.kmp.grammar.GrammarMiningStore
import com.progressivereader.kmp.grammar.GrammarPoint
import com.progressivereader.kmp.grammar.GrammarScanProgress
import com.progressivereader.kmp.grammar.GrammarScanState
import com.progressivereader.kmp.grammar.GrammarScanStatus
import com.progressivereader.kmp.grammar.GrammarStore
import com.progressivereader.kmp.grammar.HintQuality
import com.progressivereader.kmp.grammar.loadGrammarFromDrive
import com.progressivereader.kmp.grammar.mergeAndLimitExamples
import com.progressivereader.kmp.grammar.saveGrammarToDrive
import com.progressivereader.kmp.grammar.getGrammarPointById
import com.progressivereader.kmp.grammar.mineLibraryForGrammarExamples
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.BooksIndex
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.settings.AppSettings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private fun levelLabel(level: GrammarLevel): String =
    when (level) {
        GrammarLevel.N5 -> "N5"
        GrammarLevel.N4 -> "N4"
        GrammarLevel.N3 -> "N3"
        GrammarLevel.N2 -> "N2"
        GrammarLevel.N1 -> "N1"
    }

private fun canMine(point: GrammarPoint): Boolean =
    point.hintQuality == HintQuality.OK && point.hints.isNotEmpty()

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun GrammarScreen(
    settings: AppSettings,
    sessionJwt: String?,
    bookCache: BookCache,
    epubRepository: EpubRepository,
    showBack: Boolean,
    onBack: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    val isOnline = rememberIsOnline()
    val signedIn = !sessionJwt.isNullOrBlank()

    val appContext = androidx.compose.ui.platform.LocalContext.current.applicationContext
    val store = remember { GrammarStore(appContext) }
    val state by store.stateFlow.collectAsState(initial = com.progressivereader.kmp.grammar.GrammarState())

    val miningStore = remember { GrammarMiningStore(appContext) }
    var mining by remember { mutableStateOf(GrammarMiningSnapshot(updatedAt = GrammarMiningStore.isoNowUtc())) }

    var cachedIndex by remember { mutableStateOf<BooksIndex?>(null) }

    val driveService = remember(sessionJwt) { DriveService(getSessionToken = { sessionJwt }) }
    val driveJsonService =
        remember(sessionJwt, settings.driveFolderId) {
            DriveJsonFileService(
                driveService = driveService,
                getDriveFolderOverride = { settings.driveFolderId },
            )
        }

    val api = remember(sessionJwt) { GrammarApiService(getSessionToken = { sessionJwt }) }
    val openAiModel = settings.reader.openAiModel.trim().ifBlank { "gpt-4o-mini" }
    val openAiKey = settings.reader.openAiApiKey?.trim()?.takeIf { it.isNotBlank() }

    var localLoaded by remember { mutableStateOf(false) }
    var driveRestoreAttempted by remember(sessionJwt) { mutableStateOf(false) }
    var driveRestoreComplete by remember(sessionJwt) { mutableStateOf(false) }
    var driveRestoreSucceeded by remember(sessionJwt) { mutableStateOf(false) }
    var driveSaveJob by remember(sessionJwt) { mutableStateOf<Job?>(null) }
    var driveSyncStatus by remember(sessionJwt) { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        mining = miningStore.loadSnapshot()
        cachedIndex =
            runCatching { bookCache.loadIndex() }
                .getOrNull()
        localLoaded = true
    }

    // Restore grammar progress + mined examples from Drive's grammar.json (web parity).
    LaunchedEffect(localLoaded, signedIn, isOnline, sessionJwt, settings.driveFolderId) {
        if (!localLoaded) return@LaunchedEffect
        if (!signedIn || !isOnline) return@LaunchedEffect
        if (driveRestoreAttempted) return@LaunchedEffect

        driveRestoreAttempted = true
        driveRestoreComplete = false
        driveRestoreSucceeded = false
        driveSyncStatus = "Drive sync: loading grammar.json…"

        val drive =
            runCatching { loadGrammarFromDrive(driveJsonService) }
                .getOrNull()
                ?: run {
                    driveSyncStatus = "Drive sync: couldn't load grammar.json (not found or not connected)."
                    driveRestoreComplete = true
                    return@LaunchedEffect
                }

        driveRestoreSucceeded = true
        val importedExamples = drive.examplesByGrammarId.values.sumOf { it.size }
        driveSyncStatus = "Drive sync: imported ${drive.knownIds.size} known, ${drive.learningIds.size} learning, $importedExamples examples."

        val localGrammar = store.stateFlow.first()
        val mergedKnown = (localGrammar.knownIds + drive.knownIds).toSet()
        val mergedLearning =
            (localGrammar.learningIds + drive.learningIds)
                .filter { !mergedKnown.contains(it) }
                .toSet()

        runCatching { store.replaceProgress(knownIds = mergedKnown, learningIds = mergedLearning) }

        val localMining = runCatching { miningStore.loadSnapshot() }.getOrNull() ?: mining
        val mergedExamplesBy = localMining.examplesByGrammarId.toMutableMap()
        for ((gid, driveExamples) in drive.examplesByGrammarId) {
            mergedExamplesBy[gid] =
                mergeAndLimitExamples(
                    existing = mergedExamplesBy[gid].orEmpty(),
                    incoming = driveExamples,
                    limit = 3,
                )
        }
        val nextMining = localMining.copy(updatedAt = GrammarMiningStore.isoNowUtc(), examplesByGrammarId = mergedExamplesBy)
        mining = nextMining
        runCatching { miningStore.saveSnapshot(nextMining) }

        driveRestoreComplete = true
    }

    // Drive save (debounced) once we've successfully restored at least once (prevents overwriting Drive with empty state).
    LaunchedEffect(
        signedIn,
        isOnline,
        driveRestoreComplete,
        driveRestoreSucceeded,
        state.knownIds,
        state.learningIds,
        mining.examplesByGrammarId,
    ) {
        if (!signedIn || !isOnline) return@LaunchedEffect
        if (!driveRestoreComplete || !driveRestoreSucceeded) return@LaunchedEffect

        driveSaveJob?.cancel()
        driveSaveJob =
            scope.launch {
                delay(800)
                runCatching {
                    saveGrammarToDrive(
                        driveJsonService = driveJsonService,
                        knownIds = state.knownIds,
                        learningIds = state.learningIds,
                        examplesByGrammarId = mining.examplesByGrammarId,
                    )
                }
            }
    }

    val bookTitleById =
        remember(cachedIndex) {
            cachedIndex?.books?.associate { it.id to it.name }.orEmpty()
        }

    var query by remember { mutableStateOf("") }

    fun matches(point: GrammarPoint): Boolean {
        val q = query.trim()
        if (q.isBlank()) return true
        return point.title.contains(q, ignoreCase = true) || point.meaning.contains(q, ignoreCase = true)
    }

    fun examplesFor(grammarId: String): List<GrammarExample> =
        mining.examplesByGrammarId[grammarId].orEmpty()

    fun scanFor(grammarId: String): GrammarScanState? =
        mining.scanByGrammarId[grammarId]

    fun commitMining(next: GrammarMiningSnapshot, persist: Boolean) {
        mining = next
        if (persist) {
            scope.launch {
                miningStore.saveSnapshot(next)
            }
        }
    }

    fun updateMining(persist: Boolean = true, transform: (GrammarMiningSnapshot) -> GrammarMiningSnapshot) {
        val next = transform(mining).copy(updatedAt = GrammarMiningStore.isoNowUtc())
        commitMining(next, persist = persist)
    }

    fun setScanState(grammarId: String, next: GrammarScanState, persist: Boolean = true) {
        updateMining(persist = persist) { prev ->
            prev.copy(
                scanByGrammarId = prev.scanByGrammarId.toMutableMap().apply { put(grammarId, next) },
            )
        }
    }

    fun forceMine(grammarId: String) {
        val point = getGrammarPointById(grammarId)
        if (point == null) {
            setScanState(grammarId, GrammarScanState(status = GrammarScanStatus.ERROR, lastError = "Missing grammar point"))
            return
        }
        val next =
            if (canMine(point)) {
                GrammarScanState(
                    status = GrammarScanStatus.QUEUED,
                    lastError = null,
                    scannedBoundaries = scanFor(grammarId)?.scannedBoundaries.orEmpty(),
                )
            } else {
                GrammarScanState(
                    status = GrammarScanStatus.ERROR,
                    lastError = "Grammar point too ambiguous for MVP mining.",
                    scannedBoundaries = scanFor(grammarId)?.scannedBoundaries.orEmpty(),
                )
            }
        setScanState(grammarId, next, persist = true)
    }

    var activeMiningGrammarId by remember { mutableStateOf<String?>(null) }
    var priorityNextGrammarId by remember { mutableStateOf<String?>(null) }
    var activeMineJob by remember { mutableStateOf<Job?>(null) }

    fun cancelMining() {
        activeMineJob?.cancel()
        val gid = activeMiningGrammarId ?: return
        val cur = scanFor(gid)
        if (cur?.status == GrammarScanStatus.SCANNING) {
            setScanState(
                gid,
                cur.copy(
                    status = GrammarScanStatus.QUEUED,
                    lastError = "Cancelled",
                    lastScanAt = GrammarMiningStore.isoNowUtc(),
                ),
                persist = true,
            )
        }
    }

    fun runNow(grammarId: String) {
        priorityNextGrammarId = grammarId
        if (activeMiningGrammarId != null && activeMiningGrammarId != grammarId) {
            activeMineJob?.cancel()
        }
        forceMine(grammarId)
    }

    suspend fun runMine(grammarId: String) {
        val point = getGrammarPointById(grammarId) ?: return
        if (!canMine(point)) {
            setScanState(
                grammarId,
                GrammarScanState(status = GrammarScanStatus.ERROR, lastError = "Grammar point too ambiguous for MVP mining."),
                persist = true,
            )
            return
        }

        val prevScan = scanFor(grammarId)
        val already = prevScan?.scannedBoundaries.orEmpty()

        setScanState(
            grammarId,
            (prevScan ?: GrammarScanState()).copy(
                status = GrammarScanStatus.SCANNING,
                lastError = null,
                lastScanAt = GrammarMiningStore.isoNowUtc(),
            ),
            persist = true,
        )

        var lastProgress: GrammarScanProgress? = null

        try {
            val books = cachedIndex?.books.orEmpty()
            if (books.isEmpty()) {
                setScanState(
                    grammarId,
                    GrammarScanState(status = GrammarScanStatus.ERROR, lastError = "No cached books to scan."),
                    persist = true,
                )
                return
            }

            val (newExamples, scannedBoundaries) =
                mineLibraryForGrammarExamples(
                    grammar = point,
                    booksIndex = books,
                    bookCache = bookCache,
                    epubRepository = epubRepository,
                    api = api,
                    openAiModel = openAiModel,
                    openAiApiKey = openAiKey,
                    alreadyScannedBoundaries = already,
                    budgets = GrammarMinerBudgets(),
                    maxExamples = 3,
                    onProgress = { p ->
                        lastProgress = p
                        val cur = scanFor(grammarId) ?: GrammarScanState(status = GrammarScanStatus.SCANNING)
                        setScanState(
                            grammarId,
                            cur.copy(status = GrammarScanStatus.SCANNING, progress = p),
                            persist = false,
                        )
                    },
                )

            val merged =
                mergeAndLimitExamples(
                    existing = examplesFor(grammarId),
                    incoming = newExamples,
                    limit = 3,
                )

            updateMining(persist = true) { prev ->
                val nextExamplesBy = prev.examplesByGrammarId.toMutableMap().apply { put(grammarId, merged) }
                val nextScanBy = prev.scanByGrammarId.toMutableMap()
                val cur = nextScanBy[grammarId] ?: GrammarScanState()
                val mergedBoundaries = cur.scannedBoundaries.toMutableMap().apply { putAll(scannedBoundaries) }
                nextScanBy[grammarId] =
                    cur.copy(
                        status = if (merged.isNotEmpty()) GrammarScanStatus.COMPLETE else GrammarScanStatus.NOT_FOUND_YET,
                        scannedBoundaries = mergedBoundaries,
                        progress = lastProgress,
                        lastScanAt = GrammarMiningStore.isoNowUtc(),
                        lastError = null,
                    )
                prev.copy(
                    examplesByGrammarId = nextExamplesBy,
                    scanByGrammarId = nextScanBy,
                )
            }
        } catch (e: CancellationException) {
            val cur = scanFor(grammarId) ?: GrammarScanState()
            setScanState(
                grammarId,
                cur.copy(
                    status = GrammarScanStatus.QUEUED,
                    lastError = "Cancelled",
                    lastScanAt = GrammarMiningStore.isoNowUtc(),
                ),
                persist = true,
            )
        } catch (t: Throwable) {
            val cur = scanFor(grammarId) ?: GrammarScanState()
            setScanState(
                grammarId,
                cur.copy(
                    status = GrammarScanStatus.ERROR,
                    lastError = t.message ?: "Mining failed",
                    lastScanAt = GrammarMiningStore.isoNowUtc(),
                ),
                persist = true,
            )
        }
    }

    // Auto-run queued learning items sequentially (best-effort; mirrors web behavior).
    LaunchedEffect(
        state.miningEnabled,
        isOnline,
        state.learningIds,
        mining.examplesByGrammarId,
        mining.scanByGrammarId,
        priorityNextGrammarId,
        activeMiningGrammarId,
        cachedIndex,
    ) {
        if (!state.miningEnabled) return@LaunchedEffect
        if (!isOnline) return@LaunchedEffect
        if (cachedIndex?.books.isNullOrEmpty()) return@LaunchedEffect
        if (activeMineJob?.isActive == true) return@LaunchedEffect

        fun isEligible(gid: String): Boolean {
            val point = getGrammarPointById(gid) ?: return false
            if (!canMine(point)) return false
            val exCount = examplesFor(gid).size
            if (exCount >= 3) return false
            val scan = scanFor(gid)
            if (scan?.status == GrammarScanStatus.SCANNING) return false
            if (scan?.status == GrammarScanStatus.QUEUED) return true
            if (scan == null) return true
            if (scan.status == GrammarScanStatus.IDLE) return true
            // Avoid tight-loop reruns.
            return false
        }

        val forced = priorityNextGrammarId
        val next =
            if (!forced.isNullOrBlank() && isEligible(forced)) {
                forced
            } else {
                state.learningIds.firstOrNull { isEligible(it) }
            }

        if (next.isNullOrBlank()) return@LaunchedEffect

        activeMiningGrammarId = next
        val job =
            scope.launch {
                try {
                    runMine(next)
                } finally {
                    activeMiningGrammarId = null
                    if (priorityNextGrammarId == next) priorityNextGrammarId = null
                }
            }
        activeMineJob = job
        job.invokeOnCompletion {
            scope.launch(Dispatchers.Main) { activeMineJob = null }
        }
    }

    suspend fun teachExamples(grammarId: String) {
        val point = getGrammarPointById(grammarId) ?: return
        val current = examplesFor(grammarId)
        val missing = current.filter { it.teaching == null }.take(3)
        if (missing.isEmpty()) return

        val req =
            GrammarApiService.TeachExamplesRequest(
                grammar =
                    GrammarApiService.GrammarInfo(
                        id = point.id,
                        title = point.title,
                        meaning = point.meaning,
                        level = point.level.id,
                    ),
                examples =
                    missing.map { ex ->
                        GrammarApiService.TeachExampleIn(
                            exampleId = ex.id,
                            sentence = ex.sentence,
                            before = ex.before,
                            after = ex.after,
                            matchSpan =
                                GrammarApiService.Span(
                                    start = ex.match.start,
                                    end = ex.match.end,
                                    text = ex.match.text,
                                ),
                        )
                    },
                model = openAiModel,
                apiKey = openAiKey,
            )

        val resp = api.teachExamples(req)
        if (resp.teachings.isEmpty()) return

        val now = GrammarMiningStore.isoNowUtc()
        updateMining(persist = true) { prev ->
            val exList = prev.examplesByGrammarId[grammarId].orEmpty()
            val byId = exList.associateBy { it.id }.toMutableMap()
            for (t in resp.teachings) {
                val existing = byId[t.exampleId] ?: continue
                byId[t.exampleId] =
                    existing.copy(
                        teaching =
                            GrammarExampleTeaching(
                                translation = t.translation,
                                breakdown = t.breakdown,
                                usageNote = t.usageNote,
                                contrast = t.contrast,
                                createdAt = now,
                                model = openAiModel,
                            )
                    )
            }
            prev.copy(examplesByGrammarId = prev.examplesByGrammarId.toMutableMap().apply { put(grammarId, byId.values.toList()) })
        }
    }

    val totals =
        remember(state.knownIds, state.learningIds, mining.examplesByGrammarId) {
            val examples = mining.examplesByGrammarId.values.sumOf { it.size }
            Triple(state.knownIds.size, state.learningIds.size, examples)
        }

    Scaffold(
        topBar = {
            AppShellTopBar(
                title = "Grammar",
                subtitle = "Track grammar points and mined examples from your library.",
                navigationIcon =
                    if (showBack) {
                        {
                            IconButton(onClick = onBack) {
                                Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
                            }
                        }
                    } else {
                        null
                    },
                actions = {
                    IconButton(
                        onClick = {
                            scope.launch {
                                store.clearAll()
                                miningStore.clear()
                                mining = GrammarMiningSnapshot(updatedAt = GrammarMiningStore.isoNowUtc())
                            }
                        },
                        enabled = state.learningIds.isNotEmpty() || state.knownIds.isNotEmpty() || mining.examplesByGrammarId.isNotEmpty(),
                    ) {
                        Icon(Icons.Outlined.Delete, contentDescription = "Clear grammar progress")
                    }
                },
            )
        },
        bottomBar = { bottomBar?.invoke() },
    ) { padding ->
        androidx.compose.foundation.lazy.LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Known: ${totals.first} · Learning: ${totals.second} · Examples: ${totals.third}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

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

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Background miner", style = MaterialTheme.typography.titleSmall)
                                AppMutedText("Find example sentences for learning points from your cached library.")
                            }
                            Switch(
                                checked = state.miningEnabled,
                                onCheckedChange = { next -> scope.launch { store.setMiningEnabled(next) } },
                            )
                        }

                        if (!signedIn) {
                            AppMutedText("Sign in to sync grammar progress from Drive.")
                        } else if (!isOnline) {
                            AppMutedText("Offline: Drive sync paused.")
                        } else if (!driveSyncStatus.isNullOrBlank()) {
                            AppMutedText(driveSyncStatus!!)
                        }
                    }
                }
            }

            for (level in GRAMMAR_LEVELS) {
                val label = levelLabel(level)
                val allPoints = GRAMMAR_CATALOG[level].orEmpty()
                val knownCount = allPoints.count { state.knownIds.contains(it.id) }
                val learningCount = allPoints.count { state.learningIds.contains(it.id) }

                val pointsToShow =
                    if (query.trim().isBlank()) {
                        allPoints
                    } else {
                        allPoints.filter(::matches)
                    }

                if (pointsToShow.isEmpty()) continue

                val isOpen =
                    if (query.trim().isBlank()) {
                        state.openLevels.contains(level.id)
                    } else {
                        true
                    }

                item(key = "lvl_hdr:${level.id}") {
                    AppCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = query.trim().isBlank()) {
                                        scope.launch { store.toggleLevelOpen(level.id) }
                                    }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(label, style = MaterialTheme.typography.titleSmall)
                                AppMutedText("$knownCount/${allPoints.size} known · $learningCount learning")
                            }

                            val canMarkAll = knownCount < allPoints.size
                            TextButton(
                                onClick = { scope.launch { store.setKnownMany(allPoints.map { it.id }, enabled = true) } },
                                enabled = canMarkAll,
                            ) {
                                Text(if (canMarkAll) "Mark all known" else "All known")
                            }

                            Text(
                                text = if (isOpen) "–" else "+",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 4.dp),
                            )
                        }
                    }
                }

                if (!isOpen) continue

                items(count = pointsToShow.size, key = { idx -> "gp:${pointsToShow[idx].id}" }) { idx ->
                    val point = pointsToShow[idx]
                    val isLearning = state.learningIds.contains(point.id)
                    val isKnown = state.knownIds.contains(point.id)
                    val scan = scanFor(point.id)
                    val examples = examplesFor(point.id)

                    GrammarPointCard(
                        point = point,
                        isKnown = isKnown,
                        isLearning = isLearning,
                        miningEnabled = state.miningEnabled,
                        scan = scan,
                        examples = examples,
                        bookTitleById = bookTitleById,
                        onToggleKnown = { next ->
                            scope.launch {
                                store.setKnown(point.id, enabled = next)
                                if (next) {
                                    val cur = scanFor(point.id)
                                    if (cur != null && (cur.status == GrammarScanStatus.QUEUED || cur.status == GrammarScanStatus.SCANNING)) {
                                        setScanState(point.id, cur.copy(status = GrammarScanStatus.IDLE), persist = true)
                                    }
                                }
                            }
                        },
                        onToggleLearning = { next ->
                            scope.launch {
                                store.setLearning(point.id, enabled = next)
                                if (next && canMine(point)) {
                                    val cur = scanFor(point.id)
                                    if (cur == null || cur.status == GrammarScanStatus.IDLE) {
                                        setScanState(point.id, GrammarScanState(status = GrammarScanStatus.QUEUED), persist = true)
                                    }
                                }
                                if (!next) {
                                    val cur = scanFor(point.id)
                                    if (cur != null && cur.status == GrammarScanStatus.QUEUED) {
                                        setScanState(point.id, cur.copy(status = GrammarScanStatus.IDLE), persist = true)
                                    }
                                }
                            }
                        },
                        onForceMine = { forceMine(point.id) },
                        onRunNow = { runNow(point.id) },
                        onTeach = {
                            scope.launch {
                                if (!isOnline) return@launch
                                runCatching { teachExamples(point.id) }
                            }
                        },
                    )
                }

                item(key = "lvl_spacer:${level.id}") { Spacer(Modifier.height(4.dp)) }
            }

            // Background miner panel (mirrors web).
            item(key = "miner_panel") {
                val queued =
                    state.learningIds.mapNotNull { gid ->
                        val scan = scanFor(gid) ?: return@mapNotNull null
                        if (scan.status != GrammarScanStatus.QUEUED) return@mapNotNull null
                        val point = getGrammarPointById(gid) ?: return@mapNotNull null
                        val exCount = examplesFor(gid).size
                        Triple(gid, point, exCount)
                    }

                AppCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Background Miner", style = MaterialTheme.typography.titleSmall)
                                AppMutedText("Use “Run now” to prioritize a queued item.")
                            }
                            AppTextButton(
                                text = "Cancel",
                                enabled = activeMiningGrammarId != null,
                                onClick = { cancelMining() },
                            )
                        }

                        if (!state.miningEnabled) {
                            AppMutedText("Mining is disabled. Enable it above.")
                        }

                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            val activeLabel =
                                activeMiningGrammarId?.let { gid ->
                                    getGrammarPointById(gid)?.title ?: gid
                                } ?: "None"
                            AppChip("Active: $activeLabel")
                            val activeStatus =
                                activeMiningGrammarId?.let { gid ->
                                    scanFor(gid)?.status?.name?.lowercase()?.replace('_', ' ') ?: "scanning"
                                }
                            if (activeStatus != null) AppChip("Status: $activeStatus")
                        }

                        if (queued.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                AppMutedText("Queued")
                                queued.take(12).forEach { (gid, point, exCount) ->
                                    AppCard(modifier = Modifier.fillMaxWidth()) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(point.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium)
                                                AppMutedText("$exCount/3 examples")
                                            }
                                            AppTextButton(text = "Run now", onClick = { runNow(gid) })
                                            AppTextButton(text = "Re-queue", onClick = { forceMine(gid) })
                                        }
                                    }
                                }
                            }
                        } else {
                            AppMutedText("Queue is empty.")
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GrammarPointCard(
    point: GrammarPoint,
    isKnown: Boolean,
    isLearning: Boolean,
    miningEnabled: Boolean,
    scan: GrammarScanState?,
    examples: List<GrammarExample>,
    bookTitleById: Map<String, String>,
    onToggleKnown: (Boolean) -> Unit,
    onToggleLearning: (Boolean) -> Unit,
    onForceMine: () -> Unit,
    onRunNow: () -> Unit,
    onTeach: () -> Unit,
) {
    var expanded by remember(point.id) { mutableStateOf(isLearning) }
    LaunchedEffect(isLearning) {
        if (!isLearning) expanded = false
    }

    fun statusLabel(status: GrammarScanStatus?, exampleCount: Int): String {
        val effective =
            if (exampleCount >= 3) {
                GrammarScanStatus.COMPLETE
            } else {
                status ?: GrammarScanStatus.IDLE
            }
        return when (effective) {
            GrammarScanStatus.QUEUED -> "Queued"
            GrammarScanStatus.SCANNING -> "Scanning"
            GrammarScanStatus.COMPLETE -> "Ready"
            GrammarScanStatus.NOT_FOUND_YET -> "Not found yet"
            GrammarScanStatus.ERROR -> "Error"
            GrammarScanStatus.IDLE -> "Idle"
        }
    }

    @Composable
    fun renderHighlightedSentence(sentence: String, start: Int, end: Int): AnnotatedString {
        val safeStart = start.coerceIn(0, sentence.length)
        val safeEnd = end.coerceIn(safeStart, sentence.length)
        return buildAnnotatedString {
            append(sentence.substring(0, safeStart))
            withStyle(
                SpanStyle(
                    background = MaterialTheme.colorScheme.surfaceVariant,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            ) {
                append(sentence.substring(safeStart, safeEnd))
            }
            append(sentence.substring(safeEnd))
        }
    }

    AppCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .clickable(enabled = isLearning) { expanded = !expanded }
                    .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = point.title,
                            style = MaterialTheme.typography.titleSmall,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (point.hintQuality != HintQuality.OK) {
                            AppChip("auto-mining limited")
                        }
                    }
                    AppMutedText(point.meaning)
                }

                if (isLearning) {
                    Text(
                        text = if (expanded) "–" else "+",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }

            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ToggleChip(
                    label = if (isLearning) "Learning ✓" else "Learning",
                    selected = isLearning,
                    onClick = { onToggleLearning(!isLearning) },
                    accent = MaterialTheme.colorScheme.secondary,
                )
                ToggleChip(
                    label = if (isKnown) "Known ✓" else "Known",
                    selected = isKnown,
                    onClick = { onToggleKnown(!isKnown) },
                    accent = MaterialTheme.colorScheme.primary,
                )
                if (point.hints.isNotEmpty()) {
                    AppChip("${point.hints.size} hints")
                }
            }

            if (expanded) {
                val scanStatus = statusLabel(scan?.status, examples.size)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppChip("$scanStatus · ${examples.size}/3 examples")
                    val p = scan?.progress
                    if (scan?.status == GrammarScanStatus.SCANNING && p != null) {
                        AppChip("${p.booksScanned}/${p.booksTotal} books · ${p.chaptersScanned} chapters")
                    }
                }

                if (scan?.status == GrammarScanStatus.ERROR && !scan.lastError.isNullOrBlank() && examples.size < 3) {
                    Text(scan.lastError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }

                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppTonalButton(
                        text = "Find examples",
                        enabled = miningEnabled && canMine(point),
                        onClick = { onRunNow() },
                    )
                    AppOutlineButton(
                        text = "Re-queue",
                        enabled = miningEnabled && canMine(point),
                        onClick = { onForceMine() },
                    )
                    val canTeach = examples.isNotEmpty() && examples.any { it.teaching == null }
                    AppOutlineButton(
                        text = if (canTeach) "Teach" else "Taught",
                        enabled = miningEnabled && canTeach,
                        onClick = { onTeach() },
                    )
                }

                if (examples.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        examples.forEach { ex ->
                            val title = bookTitleById[ex.bookId] ?: "Unknown book"
                            val confPct = (ex.confidence.coerceIn(0.0, 1.0) * 100.0).toInt()
                            AppCard(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        AppMutedText("$title · Ch ${ex.chapterIndex + 1}", modifier = Modifier.weight(1f))
                                        AppMutedText("$confPct%")
                                    }

                                    Text(
                                        text = renderHighlightedSentence(ex.sentence, ex.match.start, ex.match.end),
                                        style = MaterialTheme.typography.bodyMedium,
                                    )

                                    if (!ex.explanation.isNullOrBlank()) {
                                        AppMutedText(ex.explanation!!)
                                    }

                                    if (ex.teaching != null) {
                                        val t = ex.teaching
                                        if (!t?.usageNote.isNullOrBlank()) {
                                            AppMutedText("Usage: ${t!!.usageNote}")
                                        }
                                        if (!t?.breakdown.isNullOrBlank()) {
                                            AppMutedText("Breakdown: ${t!!.breakdown}")
                                        }
                                        if (!t?.translation.isNullOrBlank()) {
                                            AppMutedText("Meaning: ${t!!.translation}")
                                        }
                                        if (t?.contrast != null) {
                                            AppMutedText("Contrast: ${t.contrast.alternative}")
                                            AppMutedText(t.contrast.note)
                                        }
                                    } else {
                                        AppMutedText("Teaching: pending…")
                                    }
                                }
                            }
                        }
                    }
                } else {
                    AppMutedText("No examples yet.")
                }
            }
        }
    }
}

@Composable
private fun ToggleChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    accent: androidx.compose.ui.graphics.Color,
    modifier: Modifier = Modifier,
) {
    val container =
        if (selected) {
            accent.copy(alpha = 0.18f)
        } else {
            MaterialTheme.colorScheme.surfaceVariant
        }
    val content =
        if (selected) {
            accent
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        }
    AssistChip(
        modifier = modifier,
        onClick = onClick,
        label = { Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        colors =
            AssistChipDefaults.assistChipColors(
                containerColor = container,
                labelColor = content,
            ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.75f)),
    )
}

package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.SettingsBackupRestore
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.reader.TranslationCache
import com.progressivereader.kmp.settings.AppSettings
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private enum class SettingsTab(val label: String) {
    General("General"),
    Highlight("Highlight"),
    Sync("Sync"),
}

@Serializable
private data class CloudSettingsJson(
    @SerialName("openai_api_key") val openAiApiKey: String? = null,
    @SerialName("openai_model") val openAiModel: String? = null,
    @SerialName("jpdb_api_key") val jpdbApiKey: String? = null,
    @SerialName("target_language") val targetLanguage: String? = null,
    @SerialName("uiLanguage") val uiLanguage: String? = null,
    @SerialName("userTheme") val userTheme: String? = null,
    @SerialName("fontSize") val fontSize: String? = null,
    @SerialName("cacheTranslations") val cacheTranslations: Boolean? = null,
    @SerialName("cefrLevel") val cefrLevel: String? = null,
    @SerialName("cefr_level") val cefrLevelAlt: String? = null,
)

@Serializable
private data class CloudSettingsJsonOut(
    @SerialName("openai_api_key") val openAiApiKey: String? = null,
    @SerialName("openai_model") val openAiModel: String? = null,
    @SerialName("jpdb_api_key") val jpdbApiKey: String? = null,
    @SerialName("target_language") val targetLanguage: String? = null,
    @SerialName("uiLanguage") val uiLanguage: String? = null,
    @SerialName("userTheme") val userTheme: String? = null,
    @SerialName("fontSize") val fontSize: String? = null,
    @SerialName("cacheTranslations") val cacheTranslations: Boolean? = null,
    @SerialName("cefrLevel") val cefrLevel: String? = null,
    val lastUpdated: String,
    val version: String = "1.0",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    settings: AppSettings,
    sessionJwt: String?,
    showBack: Boolean,
    onBack: () -> Unit,
    onUpdateReaderTheme: (String) -> Unit,
    onUpdateReaderFontSizeSp: (Float) -> Unit,
    onUpdateReaderTtsRate: (Float) -> Unit,
    onUpdateReaderOpenAiApiKey: (String?) -> Unit,
    onUpdateReaderOpenAiModel: (String) -> Unit,
    onUpdateReaderCacheTranslations: (Boolean) -> Unit,
    onUpdateReaderUiLanguage: (String) -> Unit,
    onUpdateReaderJpdbApiKey: (String?) -> Unit,
    onUpdateReaderCefrLevel: (String) -> Unit,
    onUpdateReaderJpdbHighlightEnabled: (Boolean) -> Unit,
    onUpdateReaderTranslationTargetLang: (String) -> Unit,
    onOpenLogin: () -> Unit,
    onSignOut: () -> Unit,
    onResetDriveOverrides: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val json =
        remember {
            Json {
                ignoreUnknownKeys = true
                isLenient = true
                encodeDefaults = true
                prettyPrint = true
            }
        }

    val driveService = remember(sessionJwt) { DriveService(getSessionToken = { sessionJwt }) }
    val signedIn = !sessionJwt.isNullOrBlank()

    var activeTab by remember { mutableStateOf(SettingsTab.General) }

    var theme by remember { mutableStateOf(settings.reader.theme) }
    var fontSizeSp by remember { mutableStateOf(settings.reader.fontSizeSp) }
    var ttsRate by remember { mutableStateOf(settings.reader.ttsRate) }
    var translationTargetLang by remember { mutableStateOf(settings.reader.translationTargetLang) }
    var cacheTranslations by remember { mutableStateOf(settings.reader.cacheTranslations) }
    var uiLanguage by remember { mutableStateOf(settings.reader.uiLanguage) }

    var openAiModel by remember { mutableStateOf(settings.reader.openAiModel) }
    var openAiApiKey by remember { mutableStateOf(settings.reader.openAiApiKey ?: "") }

    var jpdbApiKey by remember { mutableStateOf(settings.reader.jpdbApiKey ?: "") }
    var cefrLevel by remember { mutableStateOf(settings.reader.cefrLevel) }
    var highlightEnabled by remember { mutableStateOf(settings.reader.jpdbHighlightEnabled) }

    var cloudFolderName by remember { mutableStateOf<String?>(null) }
    var cloudFolderId by remember { mutableStateOf<String?>(null) }
    var cloudStatus by remember { mutableStateOf<String?>(null) }
    var cloudBusy by remember { mutableStateOf(false) }
    var cloudLastSync by remember { mutableStateOf<String?>(null) }
    var autoLoadedFromCloud by remember { mutableStateOf(false) }

    var openAiSaveJob by remember { mutableStateOf<Job?>(null) }
    var jpdbSaveJob by remember { mutableStateOf<Job?>(null) }

    LaunchedEffect(settings) {
        theme = settings.reader.theme
        fontSizeSp = settings.reader.fontSizeSp
        ttsRate = settings.reader.ttsRate
        translationTargetLang = settings.reader.translationTargetLang
        cacheTranslations = settings.reader.cacheTranslations
        uiLanguage = settings.reader.uiLanguage
        openAiModel = settings.reader.openAiModel
        openAiApiKey = settings.reader.openAiApiKey ?: ""
        jpdbApiKey = settings.reader.jpdbApiKey ?: ""
        cefrLevel = settings.reader.cefrLevel
        highlightEnabled = settings.reader.jpdbHighlightEnabled
    }

    fun DriveService.DriveFile.isFolder(): Boolean =
        mimeType?.equals("application/vnd.google-apps.folder", ignoreCase = true) == true

    suspend fun resolveAppFolder(): DriveService.DriveFile? {
        if (!signedIn) return null
        val root = driveService.listFiles(folderId = null)
        val folders = root.filter { it.isFolder() }
        return folders.firstOrNull { it.name.equals("ProgReader", ignoreCase = true) }
            ?: folders.firstOrNull { it.name.equals("ProgressiveReader", ignoreCase = true) }
    }

    suspend fun findSettingsJsonFileId(folderId: String?): String? {
        val list = driveService.listFiles(folderId = folderId)
        return list.firstOrNull { it.name.equals("settings.json", ignoreCase = true) }?.id
    }

    suspend fun ensureCloudFolderInfo() {
        if (!signedIn) return
        val overrideId = settings.driveFolderId?.takeIf { it.isNotBlank() }
        if (overrideId != null) {
            cloudFolderName = "App folder"
            cloudFolderId = overrideId
            return
        }
        val folder = resolveAppFolder()
        cloudFolderName = folder?.name ?: "Drive root"
        cloudFolderId = folder?.id
    }

    fun normalizeTheme(themeRaw: String?): String? {
        val t = themeRaw?.trim()?.lowercase() ?: return null
        return when (t) {
            "system" -> "system"
            "light" -> "light"
            "dark" -> "dark"
            "wood" -> "dark"
            "space" -> "dark"
            else -> null
        }
    }

    suspend fun loadFromCloudAndApply(manual: Boolean) {
        if (!signedIn) return
        cloudBusy = true
        try {
            ensureCloudFolderInfo()
            val settingsFileId = findSettingsJsonFileId(folderId = cloudFolderId)
            if (settingsFileId.isNullOrBlank()) {
                cloudStatus = "No settings.json found in Drive."
                if (manual) snackbarHostState.showSnackbar("No settings found in Google Drive.")
                return
            }
            val bytes = driveService.download(settingsFileId)
            val text = bytes?.toString(Charsets.UTF_8)
            if (text.isNullOrBlank()) {
                cloudStatus = "Failed to download settings.json."
                if (manual) snackbarHostState.showSnackbar("Failed to download settings from Drive.")
                return
            }

            val payload = runCatching { json.decodeFromString(CloudSettingsJson.serializer(), text) }.getOrNull()
            if (payload == null) {
                cloudStatus = "Invalid settings.json."
                if (manual) snackbarHostState.showSnackbar("Invalid settings.json in Drive.")
                return
            }

            payload.openAiApiKey?.let { v ->
                openAiApiKey = v
                onUpdateReaderOpenAiApiKey(v.trim().ifBlank { null })
            }
            payload.openAiModel?.let { v ->
                openAiModel = v
                onUpdateReaderOpenAiModel(v.trim().ifBlank { "gpt-4o-mini" })
            }
            payload.jpdbApiKey?.let { v ->
                jpdbApiKey = v
                onUpdateReaderJpdbApiKey(v.trim().ifBlank { null })
            }
            payload.targetLanguage?.let { v ->
                translationTargetLang = v
                onUpdateReaderTranslationTargetLang(v.trim().ifBlank { "English" })
            }
            payload.uiLanguage?.let { v ->
                uiLanguage = v
                onUpdateReaderUiLanguage(v.trim().ifBlank { "en" })
            }
            normalizeTheme(payload.userTheme)?.let { v ->
                theme = v
                onUpdateReaderTheme(v)
            }
            payload.cacheTranslations?.let { v ->
                cacheTranslations = v
                onUpdateReaderCacheTranslations(v)
            }
            val cefr = payload.cefrLevel ?: payload.cefrLevelAlt
            if (!cefr.isNullOrBlank()) {
                cefrLevel = cefr
                onUpdateReaderCefrLevel(cefr.trim())
            }
            payload.fontSize?.toFloatOrNull()?.let { v ->
                val clamped = v.coerceIn(12f, 32f)
                fontSizeSp = clamped
                onUpdateReaderFontSizeSp(clamped)
            }

            cloudLastSync = "Loaded from Drive"
            cloudStatus = "Synced settings from Drive."
            if (manual) snackbarHostState.showSnackbar("Settings loaded from Google Drive.")
        } finally {
            cloudBusy = false
        }
    }

    suspend fun saveToCloud(manual: Boolean) {
        if (!signedIn) return
        cloudBusy = true
        try {
            ensureCloudFolderInfo()
            val folderId = cloudFolderId
            val existingId = findSettingsJsonFileId(folderId = folderId)
            if (!existingId.isNullOrBlank()) {
                runCatching { driveService.deleteFile(existingId) }
            }

            val payload =
                CloudSettingsJsonOut(
                    openAiApiKey = openAiApiKey.trim().ifBlank { null },
                    openAiModel = openAiModel.trim().ifBlank { "gpt-4o-mini" },
                    jpdbApiKey = jpdbApiKey.trim().ifBlank { null },
                    targetLanguage = translationTargetLang.trim().ifBlank { "English" },
                    uiLanguage = uiLanguage.trim().ifBlank { "en" },
                    userTheme = theme,
                    fontSize = fontSizeSp.toInt().toString(),
                    cacheTranslations = cacheTranslations,
                    cefrLevel = cefrLevel.trim().ifBlank { "B1" },
                    lastUpdated = TranslationCache.isoNowUtc(),
                )
            val bytes = json.encodeToString(CloudSettingsJsonOut.serializer(), payload).toByteArray(Charsets.UTF_8)
            val res = driveService.upload(filename = "settings.json", bytes = bytes, mimeType = "application/json", folderId = folderId)
            if (res != null) {
                cloudLastSync = "Saved to Drive"
                cloudStatus = "Saved settings to Drive."
                if (manual) snackbarHostState.showSnackbar("Settings saved to Google Drive.")
            } else {
                cloudStatus = "Failed to save settings to Drive."
                if (manual) snackbarHostState.showSnackbar("Failed to save settings to Drive.")
            }
        } finally {
            cloudBusy = false
        }
    }

    LaunchedEffect(signedIn) {
        if (!signedIn) {
            cloudFolderName = null
            cloudFolderId = null
            cloudStatus = null
            cloudLastSync = null
            autoLoadedFromCloud = false
            return@LaunchedEffect
        }
        ensureCloudFolderInfo()
        if (!autoLoadedFromCloud) {
            autoLoadedFromCloud = true
            runCatching { loadFromCloudAndApply(manual = false) }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                title = { Text("Settings") },
                navigationIcon = {
                    if (showBack) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = { bottomBar?.invoke() },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = activeTab.ordinal) {
                SettingsTab.entries.forEach { tab ->
                    Tab(
                        selected = tab == activeTab,
                        onClick = { activeTab = tab },
                        text = { Text(tab.label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    )
                }
            }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item {
                    AppCard(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Icon(Icons.Outlined.Security, contentDescription = null)
                                Text("Account", style = MaterialTheme.typography.titleMedium)
                            }

                            if (!signedIn) {
                                Text("Status: Guest", style = MaterialTheme.typography.bodyMedium)
                                AppPrimaryButton(text = "Sign in", onClick = onOpenLogin)
                            } else {
                                Text("Status: Signed in", style = MaterialTheme.typography.bodyMedium)
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    AppTonalButton(
                                        text = "Sign out",
                                        onClick = onSignOut,
                                        icon = { Icon(Icons.Outlined.Logout, contentDescription = null) },
                                    )
                                    AppOutlineButton(
                                        text = "Refresh",
                                        enabled = !cloudBusy,
                                        onClick = { scope.launch { loadFromCloudAndApply(manual = true) } },
                                        icon = { Icon(Icons.Outlined.Refresh, contentDescription = null) },
                                    )
                                }
                            }
                        }
                    }
                }

                when (activeTab) {
                    SettingsTab.General -> {
                        item {
                            AppCard(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Icon(Icons.Outlined.Tune, contentDescription = null)
                                        Text("General", style = MaterialTheme.typography.titleMedium)
                                    }

                                    LabeledSelect(
                                        label = "Theme",
                                        value = theme,
                                        options = listOf("system", "light", "dark"),
                                        optionLabel = { it.replaceFirstChar { c -> c.uppercaseChar() } },
                                        onSelect = {
                                            theme = it
                                            onUpdateReaderTheme(it)
                                        },
                                    )

                                    AppMutedText("Matches the web theme setting; Wood/Space map to Dark on mobile.")

                                    Text("Font size: ${fontSizeSp.toInt()}sp", style = MaterialTheme.typography.bodyMedium)
                                    Slider(
                                        value = fontSizeSp.coerceIn(12f, 32f),
                                        onValueChange = { fontSizeSp = it },
                                        valueRange = 12f..32f,
                                        steps = 9,
                                        onValueChangeFinished = { onUpdateReaderFontSizeSp(fontSizeSp) },
                                    )

                                    Text("TTS speed: ${"%.2f".format(ttsRate)}x", style = MaterialTheme.typography.bodyMedium)
                                    Slider(
                                        value = ttsRate.coerceIn(0.75f, 1.5f),
                                        onValueChange = { ttsRate = it },
                                        valueRange = 0.75f..1.5f,
                                        steps = 14,
                                        onValueChangeFinished = { onUpdateReaderTtsRate(ttsRate) },
                                    )

                                    LabeledSelect(
                                        label = "Translation target language",
                                        value = translationTargetLang,
                                        options = listOf("English", "Japanese"),
                                        optionLabel = { it },
                                        onSelect = {
                                            translationTargetLang = it
                                            onUpdateReaderTranslationTargetLang(it)
                                        },
                                    )

                                    LabeledSelect(
                                        label = "OpenAI model",
                                        value = openAiModel,
                                        options = listOf("gpt-4o-mini", "gpt-4", "gpt-3.5-turbo"),
                                        optionLabel = { it },
                                        onSelect = {
                                            openAiModel = it
                                            onUpdateReaderOpenAiModel(it)
                                        },
                                    )

                                    OutlinedTextField(
                                        value = openAiApiKey,
                                        onValueChange = { v ->
                                            openAiApiKey = v
                                            openAiSaveJob?.cancel()
                                            openAiSaveJob =
                                                scope.launch {
                                                    delay(500)
                                                    onUpdateReaderOpenAiApiKey(openAiApiKey.trim().ifBlank { null })
                                                }
                                        },
                                        label = { Text("OpenAI API key (optional)") },
                                        singleLine = true,
                                        visualTransformation = PasswordVisualTransformation(),
                                        modifier = Modifier.fillMaxWidth(),
                                    )

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    ) {
                                        Text("Cache translations", style = MaterialTheme.typography.bodyMedium)
                                        Spacer(Modifier.weight(1f))
                                        Switch(
                                            checked = cacheTranslations,
                                            onCheckedChange = {
                                                cacheTranslations = it
                                                onUpdateReaderCacheTranslations(it)
                                            },
                                        )
                                    }

                                    LabeledSelect(
                                        label = "UI language",
                                        value = uiLanguage,
                                        options = listOf("en", "ja"),
                                        optionLabel = { if (it == "ja") "Japanese" else "English" },
                                        onSelect = {
                                            uiLanguage = it
                                            onUpdateReaderUiLanguage(it)
                                        },
                                    )
                                }
                            }
                        }
                    }

                    SettingsTab.Highlight -> {
                        item {
                            AppCard(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Text("Highlight", style = MaterialTheme.typography.titleMedium)

                                    OutlinedTextField(
                                        value = jpdbApiKey,
                                        onValueChange = { v ->
                                            jpdbApiKey = v
                                            jpdbSaveJob?.cancel()
                                            jpdbSaveJob =
                                                scope.launch {
                                                    delay(500)
                                                    onUpdateReaderJpdbApiKey(jpdbApiKey.trim().ifBlank { null })
                                                }
                                        },
                                        label = { Text("JPDB API key") },
                                        singleLine = true,
                                        visualTransformation = PasswordVisualTransformation(),
                                        modifier = Modifier.fillMaxWidth(),
                                    )

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    ) {
                                        Text("Highlights enabled", style = MaterialTheme.typography.bodyMedium)
                                        Spacer(Modifier.weight(1f))
                                        Switch(
                                            checked = highlightEnabled,
                                            onCheckedChange = {
                                                highlightEnabled = it
                                                onUpdateReaderJpdbHighlightEnabled(it)
                                            },
                                        )
                                    }

                                    LabeledSelect(
                                        label = "CEFR level",
                                        value = cefrLevel,
                                        options = listOf("A2", "B1", "B2", "C1"),
                                        optionLabel = { it },
                                        onSelect = {
                                            cefrLevel = it
                                            onUpdateReaderCefrLevel(it)
                                        },
                                    )

                                    AppMutedText("Used when translating with CEFR targeting enabled.")
                                }
                            }
                        }
                    }

                    SettingsTab.Sync -> {
                        item {
                            AppCard(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Icon(Icons.Outlined.Cloud, contentDescription = null)
                                        Text("Google Drive", style = MaterialTheme.typography.titleMedium)
                                    }

                                    if (!signedIn) {
                                        AppMutedText("Sign in to sync settings with Google Drive.")
                                    } else {
                                        Text("Folder: ${cloudFolderName ?: "Loading…"}", style = MaterialTheme.typography.bodyMedium)
                                        if (!cloudFolderId.isNullOrBlank()) {
                                            AppMutedText("Folder ID: $cloudFolderId")
                                        }
                                        cloudLastSync?.let { AppMutedText(it) }
                                        cloudStatus?.let { AppMutedText(it) }

                                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                            AppPrimaryButton(
                                                text = "Save to Drive",
                                                enabled = !cloudBusy,
                                                onClick = { scope.launch { saveToCloud(manual = true) } },
                                                icon = { Icon(Icons.Outlined.CloudUpload, contentDescription = null) },
                                            )
                                            AppOutlineButton(
                                                text = "Load from Drive",
                                                enabled = !cloudBusy,
                                                onClick = { scope.launch { loadFromCloudAndApply(manual = true) } },
                                                icon = { Icon(Icons.Outlined.CloudDownload, contentDescription = null) },
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        item {
                            AppCard(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier.padding(16.dp),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Icon(Icons.Outlined.SettingsBackupRestore, contentDescription = null)
                                        Text("Reset", style = MaterialTheme.typography.titleMedium)
                                    }
                                    AppMutedText("Clears any cached overrides and restores default connection settings.")
                                    AppOutlineButton(
                                        text = "Reset connection",
                                        onClick = {
                                            onResetDriveOverrides()
                                            scope.launch { snackbarHostState.showSnackbar("Reset connection settings.") }
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

@Composable
private fun LabeledSelect(
    label: String,
    value: String,
    options: List<String>,
    optionLabel: (String) -> String,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        options.forEach { opt ->
            val selected = opt.equals(value, ignoreCase = true)
            if (selected) {
                AppPrimaryButton(
                    text = optionLabel(opt),
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onSelect(opt) },
                )
            } else {
                AppTonalButton(
                    text = optionLabel(opt),
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onSelect(opt) },
                )
            }
        }
    }
}

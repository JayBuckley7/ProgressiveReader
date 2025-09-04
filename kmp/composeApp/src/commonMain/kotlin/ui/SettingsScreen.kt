package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.settings.SettingsService
import com.progressivereader.kmp.settings.SettingsRepository
import com.progressivereader.kmp.settings.ReaderSettings
import kotlinx.serialization.json.*
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(sessionTokenProvider: () -> String?) {
    val service = remember { SettingsService(sessionTokenProvider) }
    val repo = remember { SettingsRepository(service) }
    val baseUrl = remember { mutableStateOf(Config.baseUrl) }
    val readerSettings = remember { mutableStateOf(ReaderSettings()) }

    LaunchedEffect(Unit) {
        val settings = service.getSettings()
        val backend = settings?.get("backendBaseUrl")?.jsonPrimitive?.contentOrNull
        if (!backend.isNullOrBlank()) {
            baseUrl.value = backend
            Config.baseUrl = backend
        }
        readerSettings.value = repo.loadReaderSettings()
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Settings", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(value = baseUrl.value, onValueChange = { baseUrl.value = it }, label = { Text("Backend Base URL") })
        Button(onClick = {
            Config.baseUrl = baseUrl.value
            val obj = buildJsonObject { put("backendBaseUrl", JsonPrimitive(baseUrl.value)) }
            // Fire and forget
            androidx.compose.runtime.rememberCoroutineScope().launch { service.saveSettings(obj) }
        }) { Text("Save") }

        Spacer(Modifier.height(16.dp))
        Text("Reader", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(value = readerSettings.value.cefrLevel, onValueChange = { readerSettings.value = readerSettings.value.copy(cefrLevel = it) }, label = { Text("CEFR Level (e.g., A2/B1/B2)") })
        OutlinedTextField(value = readerSettings.value.fontSizeSp.toString(), onValueChange = { it.toFloatOrNull()?.let { f -> readerSettings.value = readerSettings.value.copy(fontSizeSp = f) } }, label = { Text("Font Size (sp)") })
        OutlinedTextField(value = readerSettings.value.jpdbApiKey ?: "", onValueChange = { readerSettings.value = readerSettings.value.copy(jpdbApiKey = it.ifBlank { null }) }, label = { Text("JPDB API Key") })
        Button(onClick = {
            androidx.compose.runtime.rememberCoroutineScope().launch {
                repo.saveReaderSettings(readerSettings.value)
            }
        }) { Text("Save Reader Settings") }
    }
}



package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Security
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
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.settings.AppSettings
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    settings: AppSettings,
    sessionJwt: String?,
    onBack: () -> Unit,
    onUpdateBackendBaseUrl: (String) -> Unit,
    onUpdateDriveFolderId: (String?) -> Unit,
    onUpdateReaderDarkMode: (Boolean) -> Unit,
    onUpdateReaderFontSizeSp: (Float) -> Unit,
    onOpenLogin: () -> Unit,
    onSignOut: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var backendUrl by remember { mutableStateOf(settings.backendBaseUrl) }
    var folderId by remember { mutableStateOf(settings.driveFolderId ?: "") }
    var darkMode by remember { mutableStateOf(settings.reader.darkMode) }
    var fontSizeSp by remember { mutableStateOf(settings.reader.fontSizeSp) }

    LaunchedEffect(settings) {
        backendUrl = settings.backendBaseUrl
        folderId = settings.driveFolderId ?: ""
        darkMode = settings.reader.darkMode
        fontSizeSp = settings.reader.fontSizeSp
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                AppCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Icon(Icons.Outlined.Security, contentDescription = null)
                            Text("Account", style = MaterialTheme.typography.titleMedium)
                        }

                        if (sessionJwt.isNullOrBlank()) {
                            Text("Status: Guest", style = MaterialTheme.typography.bodyMedium)
                            AppPrimaryButton(text = "Sign in", onClick = onOpenLogin)
                        } else {
                            Text("Status: Signed in", style = MaterialTheme.typography.bodyMedium)
                            AppTonalButton(
                                text = "Sign out",
                                onClick = onSignOut,
                                icon = { Icon(Icons.Outlined.Logout, contentDescription = null) },
                            )
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
                            Icon(Icons.Outlined.Link, contentDescription = null)
                            Text("Backend", style = MaterialTheme.typography.titleMedium)
                        }

                        OutlinedTextField(
                            value = backendUrl,
                            onValueChange = { backendUrl = it },
                            label = { Text("Backend base URL") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AppTonalButton(
                            text = "Save backend URL",
                            enabled = backendUrl.isNotBlank(),
                            onClick = {
                                onUpdateBackendBaseUrl(backendUrl.trim())
                                scope.launch { snackbarHostState.showSnackbar("Saved backend URL") }
                            },
                        )

                        OutlinedTextField(
                            value = folderId,
                            onValueChange = { folderId = it },
                            label = { Text("Drive folderId (optional)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        AppTonalButton(
                            text = "Save Drive folderId",
                            onClick = {
                                onUpdateDriveFolderId(folderId.trim().ifBlank { null })
                                scope.launch { snackbarHostState.showSnackbar("Saved Drive folderId") }
                            },
                        )
                    }
                }
            }

            item {
                AppCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("Appearance", style = MaterialTheme.typography.titleMedium)

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text("Dark mode", style = MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.weight(1f))
                            Switch(
                                checked = darkMode,
                                onCheckedChange = {
                                    darkMode = it
                                    onUpdateReaderDarkMode(it)
                                },
                            )
                        }

                        AppMutedText("Applies across the app and reader.")

                        Text("Font size: ${fontSizeSp.toInt()}sp", style = MaterialTheme.typography.bodyMedium)
                        Slider(
                            value = fontSizeSp.coerceIn(12f, 32f),
                            onValueChange = { fontSizeSp = it },
                            valueRange = 12f..32f,
                            steps = 9,
                            onValueChangeFinished = { onUpdateReaderFontSizeSp(fontSizeSp) },
                        )
                    }
                }
            }
        }
    }
}

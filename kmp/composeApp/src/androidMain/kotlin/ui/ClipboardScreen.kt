package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.settings.AppSettings

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClipboardScreen(
    settings: AppSettings,
    sessionJwt: String?,
    onOpenLogin: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Clipboard") },
                actions = {
                    if (sessionJwt.isNullOrBlank()) {
                        IconButton(onClick = onOpenLogin) {
                            Icon(Icons.Outlined.Login, contentDescription = "Sign in")
                        }
                    }
                },
            )
        },
        bottomBar = { bottomBar?.invoke() },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Paste or capture text from your clipboard and apply JPDB highlighting.")
                    AppIconTile(icon = Icons.Outlined.ContentPaste, contentDescription = null)
                    AppMutedText("Implementation in progress.")
                }
            }
        }
    }
}


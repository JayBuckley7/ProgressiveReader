package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.settings.AppSettings

@Composable
fun ClipboardScreen(
    settings: AppSettings,
    sessionJwt: String?,
    onOpenLogin: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    Scaffold(
        topBar = {
            AppShellTopBar(
                title = "Clipboard",
                subtitle = "Paste or capture text for lookup and highlighting.",
                actions = {
                    if (sessionJwt.isNullOrBlank()) {
                        AppShellAction(icon = Icons.Outlined.Login, contentDescription = "Sign in", onClick = onOpenLogin)
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
            AppSectionSurface(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Paste or capture text from your clipboard and apply JPDB highlighting.")
                    AppIconTile(icon = Icons.Outlined.ContentPaste, contentDescription = null)
                    AppMutedText("Implementation in progress.")
                }
            }
        }
    }
}


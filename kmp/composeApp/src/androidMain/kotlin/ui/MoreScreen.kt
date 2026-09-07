package com.progressivereader.kmp.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.BuildConfig
import com.progressivereader.kmp.auth.ClerkAndroid

@Composable
fun MoreScreen(
    sessionJwt: String?,
    onOpenClipboard: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenLogin: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val isOnline = rememberIsOnline()
    val signedIn = !sessionJwt.isNullOrBlank()

    Scaffold(
        topBar = {
            AppShellTopBar(
                title = "More",
                subtitle = "Tools, account, and reading preferences.",
            )
        },
        bottomBar = { bottomBar?.invoke() },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item {
                Column(modifier = Modifier.padding(top = 12.dp)) {
                    MoreSectionLabel("Tools")
                    MoreActionRow(
                        icon = Icons.Outlined.ContentPaste,
                        title = "Clipboard reader",
                        subtitle = "Prepare copied text for reading and lookup.",
                        onClick = onOpenClipboard,
                    )
                    HorizontalDivider(modifier = Modifier.padding(horizontal = 20.dp))
                    MoreActionRow(
                        icon = Icons.Outlined.Settings,
                        title = "Reading settings",
                        subtitle = "Appearance, translation, JPDB, and sync.",
                        onClick = onOpenSettings,
                    )
                }
            }

            item {
                Column {
                    MoreSectionLabel("Account")
                    MoreActionRow(
                        icon = Icons.Outlined.AccountCircle,
                        title = if (signedIn) "Signed in" else "Sign in",
                        subtitle =
                            when {
                                signedIn -> "Manage sync and sign-out from Settings."
                                !ClerkAndroid.isConfigured -> "Sign-in is unavailable in this build."
                                !isOnline -> "Reconnect to sign in and sync."
                                else -> "Connect Google Drive and sync your library."
                            },
                        enabled = signedIn || (ClerkAndroid.isConfigured && isOnline),
                        onClick = if (signedIn) onOpenSettings else onOpenLogin,
                    )
                }
            }

            item {
                AppBanner(
                    modifier = Modifier.padding(horizontal = 20.dp),
                    icon = if (isOnline) Icons.Outlined.CloudDone else Icons.Outlined.CloudOff,
                    title = if (isOnline) "Online" else "Offline",
                    body =
                        if (isOnline) {
                            "Network features are available."
                        } else {
                            "Downloaded books remain available. Sync resumes when you reconnect."
                        },
                )
            }

            item {
                AppMutedText(
                    text = "Progressive Reader ${BuildConfig.VERSION_NAME}",
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun MoreSectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
    )
}

@Composable
private fun MoreActionRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled, onClick = onClick)
                .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            AppMutedText(subtitle)
        }
        Icon(
            imageVector = Icons.Outlined.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

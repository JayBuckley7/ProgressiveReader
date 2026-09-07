package com.progressivereader.kmp.ui

import android.content.ClipData
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun ClipboardScreen(
    showBack: Boolean,
    onBack: () -> Unit,
    bottomBar: (@Composable () -> Unit)? = null,
) {
    val clipboard = LocalClipboard.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by rememberSaveable { mutableStateOf("") }

    val wordCount = text.trim().split(Regex("\\s+")).count { it.isNotBlank() }
    val pasteText: () -> Unit = {
        scope.launch {
            text =
                clipboard.getClipEntry()
                    ?.clipData
                    ?.takeIf { it.itemCount > 0 }
                    ?.getItemAt(0)
                    ?.coerceToText(context)
                    ?.toString()
                    .orEmpty()
        }
        Unit
    }
    val copyText: () -> Unit = {
        scope.launch {
            clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("Progressive Reader text", text)))
        }
        Unit
    }

    Scaffold(
        topBar = {
            AppShellTopBar(
                title = "Clipboard reader",
                subtitle = "Clean up copied text before reading or sharing it.",
                navigationIcon =
                    if (showBack) {
                        {
                            IconButton(onClick = onBack) {
                                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                            }
                        }
                    } else {
                        null
                    },
                actions = {
                    AppShellAction(
                        icon = Icons.Outlined.ContentPaste,
                        contentDescription = "Paste",
                        onClick = pasteText,
                    )
                    AppShellAction(
                        icon = Icons.Outlined.ContentCopy,
                        contentDescription = "Copy",
                        enabled = text.isNotBlank(),
                        onClick = copyText,
                    )
                    AppShellAction(
                        icon = Icons.Outlined.DeleteOutline,
                        contentDescription = "Clear",
                        enabled = text.isNotEmpty(),
                        onClick = { text = "" },
                    )
                },
            )
        },
        bottomBar = { bottomBar?.invoke() },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.fillMaxWidth().weight(1f),
                label = { Text("Text") },
                placeholder = { Text("Paste text here") },
                minLines = 10,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                AppMutedText("${text.length} characters")
                AppMutedText("$wordCount words")
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppTonalButton(
                    text = "Paste",
                    modifier = Modifier.weight(1f),
                    onClick = pasteText,
                )
                AppPrimaryButton(
                    text = "Copy",
                    modifier = Modifier.weight(1f),
                    enabled = text.isNotBlank(),
                    onClick = copyText,
                )
            }
        }
    }
}


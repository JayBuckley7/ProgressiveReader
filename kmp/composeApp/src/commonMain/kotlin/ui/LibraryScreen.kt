package com.progressivereader.kmp.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.progressivereader.kmp.drive.DriveService
import androidx.compose.material3.OutlinedTextField
import androidx.compose.foundation.layout.height
import androidx.compose.ui.platform.LocalContext
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts

@Composable
fun LibraryScreen(
    onOpenReader: (String) -> Unit,
    onOpenSettings: () -> Unit,
    sessionTokenProvider: () -> String?,
    onRequireLogin: () -> Unit,
) {
    val service = remember { DriveService(sessionTokenProvider) }
    val files = remember { mutableStateOf(listOf<DriveService.DriveFile>()) }
    val folderId = remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val token = sessionTokenProvider()
        if (token.isNullOrBlank()) {
            onRequireLogin(); return@LaunchedEffect
        }
        files.value = service.listFiles(folderId = folderId.value)
    }

    val context = LocalContext.current
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) {
            // Upload selected file
            val name = uri.lastPathSegment?.substringAfterLast('/') ?: "book.epub"
            val input = context.contentResolver.openInputStream(uri)
            input?.use {
                val bytes = it.readBytes()
                kotlinx.coroutines.GlobalScope.launch {
                    service.upload(filename = name, bytes = bytes, folderId = folderId.value)
                    files.value = service.listFiles(folderId.value)
                }
            }
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Library", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.weight(1f))
            Button(onClick = onOpenSettings) { Text("Settings") }
            Button(onClick = { filePicker.launch("application/epub+zip") }) { Text("Upload EPUB") }
        }
        Spacer(Modifier.size(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = folderId.value ?: "", onValueChange = { folderId.value = it.ifBlank { null } }, label = { Text("Folder Id") })
            Button(onClick = {
                // reload current folder
                kotlinx.coroutines.GlobalScope.launch {
                    files.value = service.listFiles(folderId.value)
                }
            }) { Text("Open") }
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(files.value) { f ->
                Row(Modifier.clickable { onOpenReader(f.id) }.padding(8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AsyncImage(model = f.iconLink, contentDescription = null, modifier = Modifier.size(40.dp), contentScale = ContentScale.Crop)
                    Column { Text(f.name); Text(f.mimeType ?: "", style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
    }
}



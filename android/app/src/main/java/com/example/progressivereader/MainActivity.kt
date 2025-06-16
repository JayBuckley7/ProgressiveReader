package com.example.progressivereader

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.github.barteksc.pdfviewer.PDFView
import com.folioreader.FolioReader

// Utilities for MIME type detection
import com.example.progressivereader.FileTypeUtils.getMimeType
import com.example.progressivereader.FileTypeUtils.isEpub
import com.example.progressivereader.FileTypeUtils.isPdf

/**
 * Main entry point for Progressive Reader.
 *
 * Opens a file-picker for PDFs or EPUBs and displays the selection:
 *  – PDFs are rendered with AndroidPdfViewer
 *  – EPUBs are opened with FolioReader
 *
 * Compose‐only; no legacy WebView / translation code remains.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { ReaderScreen() }
    }
}

@Composable
private fun ReaderScreen() {
    var bookUri by rememberSaveable { mutableStateOf<Uri?>(null) }
    val context = LocalContext.current

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri -> bookUri = uri }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Progressive Reader") }) }
    ) { paddingValues ->

        if (bookUri == null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Button(
                    onClick = { launcher.launch(arrayOf("application/pdf", "application/epub+zip")) }
                ) { Text("Select Book") }
            }
        } else {
            val uri = bookUri!!
            when {
                context.isPdf(uri) -> {
                    val pdfView = remember(context) { PDFView(context, null) }

                    LaunchedEffect(uri) { pdfView.fromUri(uri).load() }

                    AndroidView(
                        factory = { pdfView },
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(paddingValues)
                    )
                }
                context.isEpub(uri) -> {
                    // FolioReader handles its own activity/fragment lifecycle.
                    LaunchedEffect(uri) { FolioReader.get().openBook(context, uri) }
                }
                else -> {
                    // Fallback: show unsupported MIME type.
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(paddingValues),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("Unsupported file type: " + (context.getMimeType(uri) ?: "unknown"))
                    }
                }
            }
        }
    }
}

package com.example.progressivereader

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.github.barteksc.pdfviewer.PDFView
import com.folioreader.FolioReader

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ReaderScreen()
        }
    }
}

@Composable
fun ReaderScreen() {
    var bookUri by remember { mutableStateOf<Uri?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        bookUri = uri
    }
    val context = LocalContext.current

    Scaffold(topBar = {
        TopAppBar(title = { Text(text = "Progressive Reader") })
    }) { padding ->
        if (bookUri == null) {
            Column(modifier = Modifier
                .fillMaxSize()
                .padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
            ) {
                Button(onClick = { launcher.launch(arrayOf("application/pdf", "application/epub+zip")) }) {
                    Text("Select Book")
                }
            }
        } else {
            val uri = bookUri!!
            if (uri.toString().endsWith(".pdf")) {
                AndroidView(factory = { ctx -> PDFView(ctx, null) }, update = { view ->
                    view.fromUri(uri).load()
                }, modifier = Modifier
                    .fillMaxSize()
                    .padding(padding))
            } else {
                LaunchedEffect(uri) {
                    FolioReader.get().openBook(context, uri)
                }
            }
        }
    }
}

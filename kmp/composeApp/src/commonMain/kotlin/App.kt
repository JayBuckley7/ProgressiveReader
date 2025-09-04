package com.progressivereader.kmp

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun App() {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            val nav = com.progressivereader.kmp.navigation.rememberNavigator()
            // TODO: integrate real Clerk native SDK token provider for iOS/Android
            val sessionTokenProvider: () -> String? = { com.progressivereader.kmp.session.SessionManager.getToken() }
            com.progressivereader.kmp.ui.AppRoot(
                navigator = nav,
                sessionTokenProvider = sessionTokenProvider,
                onRequireLogin = { nav.reset(com.progressivereader.kmp.navigation.Screen.Login) }
            )
        }
    }
}

@Composable
private fun ReaderScreen() {
    var fontSizeSp by rememberSaveable { mutableStateOf(18f) }
    var darkMode by rememberSaveable { mutableStateOf(false) }
    var chapterIndex by rememberSaveable { mutableStateOf(0) }

    val chapters = remember { sampleChapters }
    val paragraphs = remember(chapterIndex) { chapters[chapterIndex].content.trim().split("\n\n") }

    val bg = if (darkMode) Color(0xFF101010) else Color(0xFFFAFAF5)
    val fg = if (darkMode) Color(0xFFEDEDED) else Color(0xFF1C1C1C)

    Column(modifier = Modifier
        .fillMaxSize()
        .background(bg)
        .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // Top controls
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(text = chapters[chapterIndex].title, color = fg, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { if (fontSizeSp > 12f) fontSizeSp -= 2f }) { Text("A-", color = fg) }
            TextButton(onClick = { if (fontSizeSp < 30f) fontSizeSp += 2f }) { Text("A+", color = fg) }
            TextButton(onClick = { darkMode = !darkMode }) { Text(if (darkMode) "Light" else "Dark", color = fg) }
        }

        Spacer(Modifier.height(8.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(paragraphs) { para ->
                Text(
                    text = para,
                    color = fg,
                    fontSize = fontSizeSp.sp,
                    lineHeight = (fontSizeSp * 1.6f).sp,
                )
            }
            item { Spacer(Modifier.height(24.dp)) }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { if (chapterIndex > 0) chapterIndex -= 1 }, enabled = chapterIndex > 0) {
                        Text("Previous")
                    }
                    Button(onClick = { if (chapterIndex < chapters.lastIndex) chapterIndex += 1 }, enabled = chapterIndex < chapters.lastIndex) {
                        Text("Next")
                    }
                }
            }
        }
    }
}

private data class Chapter(val title: String, val content: String)

private val sampleChapters = listOf(
    Chapter(
        title = "Chapter 1",
        content = """
            Welcome to Progressive Reader (KMP).\n\n
            This is sample text to demonstrate the reader layout. Adjust font size with A-/A+ and toggle Dark/Light.\n\n
            Add real content loading next: file picker, backend fetch, or local assets.
        """.trimIndent()
    ),
    Chapter(
        title = "Chapter 2",
        content = """
            Another chapter with a few paragraphs.\n\n
            Compose Multiplatform lets us share this UI across Android and iOS with minimal changes.
        """.trimIndent()
    )
)



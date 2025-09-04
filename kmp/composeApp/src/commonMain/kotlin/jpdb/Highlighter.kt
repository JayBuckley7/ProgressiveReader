package com.progressivereader.kmp.jpdb

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember

@Composable
fun JpdbHighlighter(
    text: String,
    jpdbApiKeyProvider: () -> String?,
    analyze: suspend (List<String>, String) -> List<JpdbService.ProcessedToken>,
    content: @Composable (highlightedHtml: String) -> Unit
) {
    val highlighted = remember { mutableStateOf<String?>(null) }
    LaunchedEffect(text) {
        val key = jpdbApiKeyProvider() ?: return@LaunchedEffect
        val tokens = analyze(listOf(text), key)
        // Simple span injection by offsets (best-effort – assumes plain text)
        val sb = StringBuilder(text)
        // Sort by start descending to avoid offset shifts
        tokens.sortedByDescending { it.start }.forEach { t ->
            if (t.start >= 0 && t.end <= sb.length) {
                val color = when {
                    (t.card?.get("state") as? List<*>)?.contains("known") == true -> "#2e7d32"
                    (t.card?.get("state") as? List<*>)?.contains("failed") == true -> "#c62828"
                    else -> "#1565c0"
                }
                sb.insert(t.end, "</span>")
                sb.insert(t.start, "<span style=\"background:rgba(21,101,192,0.1); color:$color\">")
            }
        }
        highlighted.value = sb.toString()
    }
    content(highlighted.value ?: text)
}



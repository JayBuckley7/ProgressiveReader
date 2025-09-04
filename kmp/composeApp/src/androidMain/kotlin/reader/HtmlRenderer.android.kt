package com.progressivereader.kmp.reader

import android.webkit.WebSettings
import android.webkit.WebView
import androidx.compose.runtime.Composable
import androidx.compose.ui.viewinterop.AndroidView

@Composable
actual fun HtmlContent(html: String, darkMode: Boolean, fontSizeSp: Float) {
    AndroidView(factory = { ctx ->
        WebView(ctx).apply {
            settings.javaScriptEnabled = false
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            setBackgroundColor(0)
        }
    }, update = { webView ->
        val css = """
            body { margin: 0; padding: 0 12px; font-size: ${fontSizeSp}pt; line-height: ${fontSizeSp * 1.6}pt; }
            body { background: ${if (darkMode) "#101010" else "#FAFAF5"}; color: ${if (darkMode) "#EDEDED" else "#1C1C1C"}; }
            img { max-width: 100%; height: auto; }
        """.trimIndent()
        val doc = "<html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><style>$css</style></head><body>$html</body></html>"
        webView.loadDataWithBaseURL(null, doc, "text/html", "utf-8", null)
    })
}



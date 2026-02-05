package com.progressivereader.kmp.reader

import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.viewinterop.AndroidView

@Composable
actual fun HtmlContent(
    html: String,
    baseUrl: String?,
    darkMode: Boolean,
    fontSizeSp: Float,
    onUrlClick: (String) -> Boolean,
) {
    val onUrlClickState = rememberUpdatedState(onUrlClick)

    AndroidView(factory = { ctx ->
        WebView(ctx).apply {
            settings.javaScriptEnabled = false
            settings.domStorageEnabled = false
            settings.cacheMode = WebSettings.LOAD_NO_CACHE
            settings.blockNetworkLoads = true
            settings.allowFileAccess = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setBackgroundColor(0)

            webViewClient =
                object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        val url = request.url?.toString() ?: return false
                        if (url.startsWith("pr://")) return onUrlClickState.value(url)
                        // Prevent navigation to external sites (network is blocked anyway).
                        if (url.startsWith("http://") || url.startsWith("https://")) return true
                        return false
                    }
                }
        }
    }, update = { webView ->
        val css = """
            :root { color-scheme: ${if (darkMode) "dark" else "light"}; }
            body { margin: 0; padding: 0 12px; font-size: ${fontSizeSp}pt; line-height: ${fontSizeSp * 1.6}pt; }
            body { background: ${if (darkMode) "#0E1114" else "#F7F6F2"}; color: ${if (darkMode) "rgba(255,255,255,0.92)" else "#14181F"}; }
            img { max-width: 100%; height: auto; }

            /* JPDB highlight styles (ported from web, simplified) */
            a.jpdb-word { color: inherit; text-decoration: none; border-radius: 6px; padding: 0 2px; }
            a.jpdb-word.known { background: rgba(46, 204, 113, 0.22); }
            a.jpdb-word.new { background: rgba(231, 76, 60, 0.22); }
            a.jpdb-word.learning { background: rgba(241, 196, 15, 0.22); }
            a.jpdb-word.failed { background: rgba(255, 0, 0, 0.16); }
            a.jpdb-word.due { background: rgba(255, 69, 0, 0.18); }
            a.jpdb-word.not-in-deck { background: rgba(149, 165, 166, 0.18); }
            a.jpdb-word.unknown { background: rgba(52, 152, 219, 0.18); }
            a.jpdb-word.blacklisted { background: rgba(149, 165, 166, 0.18); }
            a.jpdb-word.never-forget { background: rgba(46, 204, 113, 0.18); }

            a.jpdb-word:active { outline: 1px solid rgba(255,255,255,0.22); }
        """.trimIndent()
        val doc = "<html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><style>$css</style></head><body>$html</body></html>"
        webView.loadDataWithBaseURL(baseUrl, doc, "text/html", "utf-8", null)
    })
}

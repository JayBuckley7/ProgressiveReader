package com.progressivereader.kmp.reader

import android.view.MotionEvent
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.viewinterop.AndroidView
import kotlin.math.abs

@Composable
actual fun HtmlContent(
    html: String,
    baseUrl: String?,
    darkMode: Boolean,
    fontSizeSp: Float,
    onUrlClick: (String) -> Boolean,
    onSwipe: ((SwipeDirection) -> Unit)?,
) {
    val onUrlClickState = rememberUpdatedState(onUrlClick)
    val onSwipeState = rememberUpdatedState(onSwipe)

    AndroidView(factory = { ctx ->
        val density = ctx.resources.displayMetrics.density
        val minSwipeDxPx = 72f * density

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

            setOnTouchListener(
                object : View.OnTouchListener {
                    var downX = 0f
                    var downY = 0f
                    var didSwipe = false

                    override fun onTouch(v: View, event: MotionEvent): Boolean {
                        val handler = onSwipeState.value ?: return false
                        if (event.pointerCount != 1) return false

                        when (event.actionMasked) {
                            MotionEvent.ACTION_DOWN -> {
                                downX = event.x
                                downY = event.y
                                didSwipe = false
                            }

                            MotionEvent.ACTION_UP -> {
                                if (didSwipe) return false
                                val dx = event.x - downX
                                val dy = event.y - downY

                                // Avoid accidental triggers while vertically scrolling.
                                val absDx = abs(dx)
                                val absDy = abs(dy)
                                val isHorizontalSwipe = absDx >= minSwipeDxPx && absDx > absDy * 1.3f
                                if (isHorizontalSwipe) {
                                    didSwipe = true
                                    handler(if (dx < 0) SwipeDirection.LEFT else SwipeDirection.RIGHT)
                                    // Consume the event so we don't also click a word/link on swipe end.
                                    return true
                                }
                            }

                            MotionEvent.ACTION_CANCEL -> {
                                didSwipe = false
                            }
                        }

                        return false
                    }
                }
            )
        }
    }, update = { webView ->
        // Keep this CSS aligned with the web reader (frontend/src/styles.css) so highlight colors match.
        val css = """
            :root { color-scheme: ${if (darkMode) "dark" else "light"}; }
            body { margin: 0; padding: 0 14px 18px; font-size: ${fontSizeSp}pt; line-height: ${fontSizeSp * 1.65}pt; }
            body { background: ${if (darkMode) "#0E1114" else "#F7F6F2"}; color: ${if (darkMode) "rgba(255,255,255,0.92)" else "#14181F"}; }
            img { max-width: 100%; height: auto; }

            /* JPDB highlight styles (ported from web: frontend/src/styles.css) */
            rt { user-select: none; pointer-events: none; }

            .jpdb-word ruby, .jpdb-word rt { color: inherit !important; font-size: inherit; }
            .jpdb-word rt { font-size: 60%; }

            a.jpdb-word { color: inherit; text-decoration: none; }
            a.jpdb-word:active { text-decoration: underline; outline: 1px solid rgba(255,255,255,0.22); }

            .jpdb-word.locked { color: rgb(119, 119, 119); }
            .jpdb-word.suspended { color: rgb(119, 119, 119); }
            .jpdb-word.blacklisted { color: rgb(119, 119, 119); }
            .jpdb-word.never-forget { color: rgb(112, 192, 0); }

            .jpdb-word.not-in-deck { color: rgba(75, 141, 255, 0.5); }
            .jpdb-word.unknown { color: rgba(75, 141, 255, 0.5); }
            .jpdb-word.new { color: rgb(75, 141, 255); }
            .jpdb-word.learning { color: rgb(94, 167, 128); }
            .jpdb-word.known { color: rgb(112, 192, 0); }
            .jpdb-word.due { color: rgb(255, 69, 0); }
            .jpdb-word.failed { color: rgb(255, 0, 0); }

            .jpdb-word.common-word { color: inherit; }
            .jpdb-word.jlpt-n5 { color: rgb(34, 197, 94); }
            .jpdb-word.jlpt-n4 { color: rgb(59, 130, 246); }
            .jpdb-word.jlpt-n3 { color: rgb(245, 158, 11); }
            .jpdb-word.jlpt-n2 { color: rgb(147, 51, 234); }
            .jpdb-word.jlpt-n1 { color: rgb(239, 68, 68); }

            .jpdb-word.jlpt-unknown {
                color: rgba(119, 119, 119, 1);
                background-color: rgba(119, 119, 119, 0.15);
                border-radius: 2px;
                padding: 1px 2px;
            }

        """.trimIndent()
        val doc = "<html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><style>$css</style></head><body>$html</body></html>"
        webView.loadDataWithBaseURL(baseUrl, doc, "text/html", "utf-8", null)
    })
}

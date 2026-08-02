package com.progressivereader.kmp.reader

import android.annotation.SuppressLint
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.viewinterop.AndroidView
import kotlin.math.abs

private class ReaderWebView(context: Context) : WebView(context) {
    var lastChapterKey: String? = null
    var lastContentKey: String? = null
    var lastPresentationKey: String? = null
    var pendingRestoreScrollY: Int? = null

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}

internal fun cssForPresentation(presentation: HtmlPresentationSpec): String =
    """
    :root {
        color-scheme: ${if (presentation.darkMode) "dark" else "light"};
        --pr-bg: ${if (presentation.darkMode) "#0B0E12" else "#F4F1EB"};
        --pr-text: ${if (presentation.darkMode) "rgba(255,255,255,0.92)" else "#14181F"};
        --pr-muted: ${if (presentation.darkMode) "rgba(229,231,235,0.9)" else "rgba(55,65,81,0.95)"};
        --pr-surface: ${if (presentation.darkMode) "#12161B" else "#FCFBF8"};
        --pr-accent: rgba(75, 141, 255, 0.35);
        --pr-font-size: ${presentation.fontSizeSp}pt;
        --pr-line-height: ${presentation.fontSizeSp * 1.65}pt;
    }
    body {
        margin: 0;
        padding: 0 14px 18px;
        font-size: var(--pr-font-size);
        line-height: var(--pr-line-height);
        background: var(--pr-bg);
        color: var(--pr-text);
    }
    img { max-width: 100%; height: auto; }

    .pr-translation {
        margin-top: 0.35rem;
        padding-left: 0.75rem;
        border-left: 2px solid var(--pr-accent);
        opacity: 0.9;
        font-size: 0.95em;
        line-height: 1.6;
        color: var(--pr-muted);
    }

    rt { user-select: none; pointer-events: none; }
    .jpdb-word ruby, .jpdb-word rt { color: inherit !important; font-size: inherit; }
    .jpdb-word rt { font-size: 60%; }

    a.jpdb-word { color: inherit; text-decoration: none; }
    a.jpdb-word:active { text-decoration: underline; outline: 1px solid rgba(255,255,255,0.22); }

    a.jpdb-word.pr-grammar-hit--candidate {
        text-decoration-line: underline;
        text-decoration-style: dotted;
        text-decoration-color: rgba(245, 158, 11, 0.85);
        text-decoration-thickness: 2px;
        text-underline-offset: 0.18em;
    }

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

internal fun buildDocumentHtml(
    document: HtmlDocumentSpec,
    presentation: HtmlPresentationSpec,
): String =
    """
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style id="pr-base-style">${cssForPresentation(presentation)}</style>
        ${document.headHtml}
      </head>
      <body>${document.bodyHtml}</body>
    </html>
    """.trimIndent()

private fun ReaderWebView.applyPresentation(presentation: HtmlPresentationSpec) {
    val bg = if (presentation.darkMode) "#0B0E12" else "#F4F1EB"
    val text = if (presentation.darkMode) "rgba(255,255,255,0.92)" else "#14181F"
    val muted = if (presentation.darkMode) "rgba(229,231,235,0.9)" else "rgba(55,65,81,0.95)"
    val css =
        """
        (function() {
          var style = document.getElementById('pr-base-style');
          if (!style) return;
          document.documentElement.style.setProperty('--pr-bg', '$bg');
          document.documentElement.style.setProperty('--pr-text', '$text');
          document.documentElement.style.setProperty('--pr-muted', '$muted');
          document.documentElement.style.setProperty('--pr-font-size', '${presentation.fontSizeSp}pt');
          document.documentElement.style.setProperty('--pr-line-height', '${presentation.fontSizeSp * 1.65}pt');
          document.documentElement.style.setProperty('color-scheme', '${if (presentation.darkMode) "dark" else "light"}');
          document.body.style.background = '$bg';
          document.body.style.color = '$text';
          document.body.style.fontSize = '${presentation.fontSizeSp}pt';
          document.body.style.lineHeight = '${presentation.fontSizeSp * 1.65}pt';
        })();
        """.trimIndent()
    evaluateJavascript(css, null)
    setBackgroundColor(android.graphics.Color.TRANSPARENT)
}

@Composable
@SuppressLint("SetJavaScriptEnabled") // Required only for local CSS updates; network loads and document scripts are blocked.
actual fun HtmlContent(
    document: HtmlDocumentSpec,
    presentation: HtmlPresentationSpec,
    onUrlClick: (String) -> Boolean,
    onSwipe: ((SwipeDirection) -> Unit)?,
    onInteraction: (() -> Unit)?,
) {
    val onUrlClickState = rememberUpdatedState(onUrlClick)
    val onSwipeState = rememberUpdatedState(onSwipe)
    val onInteractionState = rememberUpdatedState(onInteraction)
    val presentationState = rememberUpdatedState(presentation)

    AndroidView(
        factory = { ctx ->
            val density = ctx.resources.displayMetrics.density
            val minSwipeDxPx = 72f * density

            ReaderWebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.cacheMode = WebSettings.LOAD_NO_CACHE
                settings.blockNetworkLoads = true
                settings.allowFileAccess = true
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                overScrollMode = View.OVER_SCROLL_NEVER
                setBackgroundColor(android.graphics.Color.TRANSPARENT)

                webChromeClient = WebChromeClient()
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            val url = request.url?.toString() ?: return false
                            if (url.startsWith("pr://")) return onUrlClickState.value(url)
                            if (url.startsWith("http://") || url.startsWith("https://")) return true
                            return false
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            super.onPageFinished(view, url)
                            val readerView = view as? ReaderWebView ?: return
                            readerView.applyPresentation(presentationState.value)
                            val restoreScrollY = readerView.pendingRestoreScrollY ?: return
                            readerView.pendingRestoreScrollY = null
                            readerView.post { readerView.scrollTo(0, restoreScrollY) }
                        }
                    }

                setOnTouchListener(
                    object : View.OnTouchListener {
                        var downX = 0f
                        var downY = 0f
                        var didSwipe = false

                        override fun onTouch(v: View, event: MotionEvent): Boolean {
                            if (event.pointerCount != 1) return false

                            when (event.actionMasked) {
                                MotionEvent.ACTION_DOWN -> {
                                    onInteractionState.value?.invoke()
                                    downX = event.x
                                    downY = event.y
                                    didSwipe = false
                                }

                                MotionEvent.ACTION_UP -> {
                                    if (didSwipe) return false
                                    val dx = event.x - downX
                                    val dy = event.y - downY
                                    val absDx = abs(dx)
                                    val absDy = abs(dy)
                                    val isHorizontalSwipe = absDx >= minSwipeDxPx && absDx > absDy * 1.35f
                                    val handler = onSwipeState.value
                                    if (isHorizontalSwipe && handler != null) {
                                        didSwipe = true
                                        handler(if (dx < 0) SwipeDirection.LEFT else SwipeDirection.RIGHT)
                                        return true
                                    }
                                    v.performClick()
                                }

                                MotionEvent.ACTION_CANCEL -> {
                                    didSwipe = false
                                }
                            }

                            return false
                        }
                    },
                )
            }
        },
        update = { webView ->
            val documentChanged = webView.lastContentKey != document.contentKey
            val presentationKey = "${presentation.darkMode}:${presentation.fontSizeSp}"
            val presentationChanged = webView.lastPresentationKey != presentationKey

            if (documentChanged) {
                val restoreScroll =
                    if (webView.lastChapterKey == document.chapterKey) {
                        webView.scrollY
                    } else {
                        0
                    }
                webView.pendingRestoreScrollY = restoreScroll
                webView.lastChapterKey = document.chapterKey
                webView.lastContentKey = document.contentKey
                webView.lastPresentationKey = presentationKey
                webView.loadDataWithBaseURL(
                    document.baseUrl,
                    buildDocumentHtml(document, presentation),
                    "text/html",
                    "utf-8",
                    null,
                )
            } else if (presentationChanged) {
                val scrollY = webView.scrollY
                webView.lastPresentationKey = presentationKey
                webView.applyPresentation(presentation)
                webView.post { webView.scrollTo(0, scrollY) }
            }
        },
    )
}

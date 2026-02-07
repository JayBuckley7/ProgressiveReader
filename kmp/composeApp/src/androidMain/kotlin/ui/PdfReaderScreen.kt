package com.progressivereader.kmp.ui

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.StopCircle
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.offline.BookState
import com.progressivereader.kmp.settings.AppSettings
import com.progressivereader.kmp.tts.TtsController
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfReaderScreen(
    bookId: String,
    title: String,
    settings: AppSettings,
    bookCache: BookCache,
    onBack: () -> Unit,
    onOpenSettings: () -> Unit,
    onSetTtsRate: (Float) -> Unit,
) {
    val pdfFile = remember(bookId) { bookCache.pdfFile(bookId) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val ttsController = remember { TtsController(context) }
    DisposableEffect(ttsController) { onDispose { ttsController.shutdown() } }
    val ttsReady by ttsController.isReady.collectAsState(initial = false)
    val isSpeaking by ttsController.isSpeaking.collectAsState(initial = false)
    val isPaused by ttsController.isPaused.collectAsState(initial = false)
    var ttsRate by remember { mutableStateOf(settings.reader.ttsRate) }
    var showTtsSheet by remember { mutableStateOf(false) }
    var isExtractingTtsText by remember { mutableStateOf(false) }
    var ttsTextError by remember { mutableStateOf<String?>(null) }

    var renderer by remember(pdfFile) { mutableStateOf<PdfRenderer?>(null) }
    var fileDescriptor by remember(pdfFile) { mutableStateOf<ParcelFileDescriptor?>(null) }
    var pageCount by remember(pdfFile) { mutableStateOf(0) }

    DisposableEffect(pdfFile) {
        if (pdfFile.exists()) {
            val fd = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
            fileDescriptor = fd
            val r = PdfRenderer(fd)
            renderer = r
            pageCount = r.pageCount
        }
        onDispose {
            runCatching { renderer?.close() }
            runCatching { fileDescriptor?.close() }
            renderer = null
            fileDescriptor = null
            pageCount = 0
        }
    }

    var state by remember(bookId) { mutableStateOf(BookState()) }
    var pageIndex by remember(bookId) { mutableStateOf(0) }
    var stateLoaded by remember(bookId) { mutableStateOf(false) }
    val ttsTextCache = remember(bookId) { mutableStateMapOf<Int, String>() }

    LaunchedEffect(settings.reader.ttsRate) {
        ttsRate = settings.reader.ttsRate
        ttsController.setRate(ttsRate)
    }

    LaunchedEffect(bookId, pageIndex) { ttsController.stop() }

    LaunchedEffect(bookId) {
        stateLoaded = false
        val loaded = runCatching { bookCache.loadState(bookId) }.getOrNull() ?: BookState()
        state = loaded
        pageIndex = loaded.lastPdfPageIndex.coerceAtLeast(0)
        stateLoaded = true
    }

    fun setPage(idx: Int) {
        val maxIdx = (pageCount - 1).coerceAtLeast(0)
        pageIndex = idx.coerceIn(0, maxIdx)
    }

    suspend fun extractPageText(idx: Int): String? =
        withContext(Dispatchers.Default) {
            if (!pdfFile.exists()) return@withContext null
            runCatching {
                val doc = PDDocument.load(pdfFile)
                try {
                    val stripper = PDFTextStripper().apply {
                        startPage = idx + 1
                        endPage = idx + 1
                    }
                    stripper.getText(doc).trim().takeIf { it.isNotBlank() }
                } finally {
                    runCatching { doc.close() }
                }
            }.getOrNull()
        }

    LaunchedEffect(stateLoaded, pageIndex) {
        if (!stateLoaded) return@LaunchedEffect
        val updated = state.copy(lastPdfPageIndex = pageIndex)
        if (updated == state) return@LaunchedEffect
        state = updated
        runCatching { bookCache.saveState(bookId, updated) }
    }

    var isRendering by remember(pageIndex, renderer) { mutableStateOf(false) }
    var bitmap by remember(pageIndex, renderer) { mutableStateOf<Bitmap?>(null) }
    var renderError by remember(pageIndex, renderer) { mutableStateOf<String?>(null) }

    LaunchedEffect(pageIndex, renderer) {
        val r = renderer ?: return@LaunchedEffect
        renderError = null
        bitmap = null
        isRendering = true
        val rendered =
            withContext(Dispatchers.Default) {
                runCatching {
                    r.openPage(pageIndex).use { page ->
                        val bmp =
                            Bitmap.createBitmap(
                                page.width,
                                page.height,
                                Bitmap.Config.ARGB_8888,
                            )
                        bmp.eraseColor(android.graphics.Color.WHITE)
                        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        bmp
                    }
                }.getOrNull()
            }
        isRendering = false
        if (rendered == null) {
            renderError = "Failed to render page."
        } else {
            bitmap = rendered
        }
    }

    val maxIdx = (pageCount - 1).coerceAtLeast(0)
    val density = LocalDensity.current
    val minSwipeDxPx = with(density) { 72.dp.toPx() }

    Scaffold(
        topBar = {
            TopAppBar(
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                title = {
                    Column {
                        Text(
                            text = title,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (pageCount > 0) {
                            Text(
                                text = "Page ${pageIndex + 1} / $pageCount",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(
                        enabled = pageCount > 0 && ttsReady && !isExtractingTtsText,
                        onClick = {
                            showTtsSheet = true
                            ttsTextError = null
                            if (isSpeaking) return@IconButton ttsController.pause()
                            if (isPaused) return@IconButton ttsController.resume()

                            val cached = ttsTextCache[pageIndex]
                            if (!cached.isNullOrBlank()) {
                                ttsController.speak(cached)
                                return@IconButton
                            }

                            isExtractingTtsText = true
                            scope.launch {
                                val extracted = extractPageText(pageIndex)
                                isExtractingTtsText = false
                                if (extracted.isNullOrBlank()) {
                                    ttsTextError = "No extractable text found on this page."
                                } else {
                                    ttsTextCache[pageIndex] = extracted
                                    ttsController.speak(extracted)
                                }
                            }
                        },
                    ) {
                        Icon(
                            when {
                                isSpeaking -> Icons.Outlined.PauseCircle
                                isPaused -> Icons.Outlined.PlayCircle
                                else -> Icons.Outlined.VolumeUp
                            },
                            contentDescription = "Text to speech",
                            tint =
                                if (isSpeaking || isPaused) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        )
                    }

                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Outlined.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when {
                !pdfFile.exists() -> Text("PDF is not cached.", color = MaterialTheme.colorScheme.error)
                renderer == null -> CircularProgressIndicator()
                renderError != null -> Text(renderError!!, color = MaterialTheme.colorScheme.error)
                isRendering -> CircularProgressIndicator()
                bitmap == null -> CircularProgressIndicator()
                else -> {
                    val img = bitmap!!.asImageBitmap()
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                        Image(
                            bitmap = img,
                            contentDescription = title,
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .pointerInput(pageIndex, pageCount) {
                                        var totalDx = 0f
                                        var totalDy = 0f
                                        detectDragGestures(
                                            onDragStart = {
                                                totalDx = 0f
                                                totalDy = 0f
                                            },
                                            onDrag = { _, dragAmount ->
                                                totalDx += dragAmount.x
                                                totalDy += dragAmount.y
                                            },
                                            onDragEnd = {
                                                val absDx = abs(totalDx)
                                                val absDy = abs(totalDy)
                                                val isHorizontalSwipe = absDx >= minSwipeDxPx && absDx > absDy * 1.3f
                                                if (!isHorizontalSwipe) return@detectDragGestures

                                                if (totalDx < 0) {
                                                    if (pageIndex < maxIdx) setPage(pageIndex + 1)
                                                } else {
                                                    if (pageIndex > 0) setPage(pageIndex - 1)
                                                }
                                            },
                                        )
                                    },
                            contentScale = ContentScale.Fit,
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    AppMutedText("Tip: swipe left/right to change pages. Use the speaker icon for TTS.")
                }
            }
        }
    }

    if (showTtsSheet) {
        ModalBottomSheet(
            onDismissRequest = { showTtsSheet = false },
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(text = "Text to speech", style = MaterialTheme.typography.titleMedium)

                if (isExtractingTtsText) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.height(18.dp))
                        AppMutedText("Extracting text…")
                    }
                }

                ttsTextError?.let { Text(it, color = MaterialTheme.colorScheme.error) }

                AppMutedText("Speed: ${"%.2f".format(ttsRate)}x")
                Slider(
                    value = ttsRate.coerceIn(0.75f, 1.5f),
                    onValueChange = { next ->
                        val clamped = next.coerceIn(0.75f, 1.5f)
                        ttsRate = clamped
                        ttsController.setRate(clamped)
                    },
                    valueRange = 0.75f..1.5f,
                    onValueChangeFinished = { onSetTtsRate(ttsRate) },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AppTonalButton(
                        text =
                            when {
                                isSpeaking -> "Pause"
                                isPaused -> "Resume"
                                else -> "Speak"
                            },
                        enabled = ttsReady && !isExtractingTtsText && pageCount > 0,
                        onClick = {
                            ttsTextError = null
                            when {
                                isSpeaking -> return@AppTonalButton ttsController.pause()
                                isPaused -> return@AppTonalButton ttsController.resume()
                            }

                            val cached = ttsTextCache[pageIndex]
                            if (!cached.isNullOrBlank()) {
                                ttsController.speak(cached)
                                return@AppTonalButton
                            }

                            isExtractingTtsText = true
                            scope.launch {
                                val extracted = extractPageText(pageIndex)
                                isExtractingTtsText = false
                                if (extracted.isNullOrBlank()) {
                                    ttsTextError = "No extractable text found on this page."
                                } else {
                                    ttsTextCache[pageIndex] = extracted
                                    ttsController.speak(extracted)
                                }
                            }
                        },
                        icon = {
                            Icon(
                                when {
                                    isSpeaking -> Icons.Outlined.PauseCircle
                                    isPaused -> Icons.Outlined.PlayCircle
                                    else -> Icons.Outlined.VolumeUp
                                },
                                contentDescription = null,
                            )
                        },
                        modifier = Modifier.weight(1f),
                    )

                    AppOutlineButton(
                        text = "Stop",
                        enabled = isSpeaking || isPaused,
                        onClick = { ttsController.stop() },
                    )
                }

                AppOutlineButton(
                    text = "Close",
                    onClick = { showTtsSheet = false },
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(6.dp))
            }
        }
    }
}

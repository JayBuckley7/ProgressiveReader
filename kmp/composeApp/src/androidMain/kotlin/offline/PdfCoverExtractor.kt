package com.progressivereader.kmp.offline

import android.graphics.Bitmap
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Best-effort PDF cover generation for parity with web's "cover art" display.
 *
 * Renders page 1 to `cover.jpg` in the book directory. This is only for local/offline UI and does
 * not attempt to sync to Drive.
 */
suspend fun extractPdfCoverIfNeeded(bookCache: BookCache, bookId: String): File? =
    withContext(Dispatchers.IO) {
        val pdf = bookCache.pdfFile(bookId)
        if (!pdf.exists()) return@withContext null

        val cover = bookCache.coverFile(bookId, ext = "jpg")
        if (cover.exists() && cover.isFile && cover.length() > 0) return@withContext cover

        val tmp = File(cover.parentFile, "${cover.name}.tmp")
        tmp.delete()

        var fd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        try {
            fd = ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY)
            renderer = PdfRenderer(fd)
            if (renderer.pageCount <= 0) return@withContext null

            renderer.openPage(0).use { page ->
                // Keep the cover reasonably sized to avoid blowing up memory on large PDFs.
                val maxDimPx = 1200
                val srcW = page.width.coerceAtLeast(1)
                val srcH = page.height.coerceAtLeast(1)
                val scale = minOf(1.0, maxDimPx.toDouble() / maxOf(srcW, srcH).toDouble())
                val dstW = (srcW * scale).toInt().coerceAtLeast(1)
                val dstH = (srcH * scale).toInt().coerceAtLeast(1)

                val bmp = Bitmap.createBitmap(dstW, dstH, Bitmap.Config.ARGB_8888)
                bmp.eraseColor(android.graphics.Color.WHITE)
                page.render(bmp, Rect(0, 0, dstW, dstH), null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

                tmp.parentFile?.mkdirs()
                tmp.outputStream().use { os ->
                    // JPEG gives best size/quality for thumbnails.
                    bmp.compress(Bitmap.CompressFormat.JPEG, 85, os)
                }
                bmp.recycle()
            }

            if (tmp.exists() && tmp.length() > 0) {
                if (!tmp.renameTo(cover)) {
                    // Fallback for cross-filesystem rename quirks.
                    cover.outputStream().use { os -> tmp.inputStream().use { it.copyTo(os) } }
                    tmp.delete()
                }
                cover
            } else {
                tmp.delete()
                null
            }
        } catch (_: Throwable) {
            tmp.delete()
            null
        } finally {
            runCatching { renderer?.close() }
            runCatching { fd?.close() }
        }
    }


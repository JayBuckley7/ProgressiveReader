package com.progressivereader.kmp.reader

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.zip.ZipInputStream

actual class EpubParser {
    actual suspend fun parse(epubBytes: ByteArray): EpubBook = withContext(Dispatchers.IO) {
        // Minimal stub parser: list .xhtml/.html entries in zip, read text content
        val chapters = mutableListOf<String>()
        val toc = mutableListOf<EpubTocItem>()
        ZipInputStream(epubBytes.inputStream()).use { zis ->
            var idx = 0
            var entry = zis.nextEntry
            while (entry != null) {
                if (!entry.isDirectory && (entry.name.endsWith(".xhtml") || entry.name.endsWith(".html"))) {
                    val content = zis.readBytes().toString(Charsets.UTF_8)
                    chapters.add(content)
                    toc.add(EpubTocItem(title = entry.name.substringAfterLast('/'), href = entry.name, index = idx))
                    idx++
                }
                entry = zis.nextEntry
            }
        }
        val title = toc.firstOrNull()?.title ?: "Untitled"
        EpubBook(title = title, chapters = chapters, toc = toc)
    }
}



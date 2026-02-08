package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.domain.reader.BookFormat
import com.progressivereader.kmp.domain.reader.BookState
import com.progressivereader.kmp.domain.reader.ChapterContent
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.ports.CryptoPort
import com.progressivereader.kmp.ports.ReaderPort
import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.EpubRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidReaderPort(
    private val bookCache: BookCache,
    private val epubRepository: EpubRepository,
    private val cryptoPort: CryptoPort,
) : ReaderPort {
    override suspend fun resolveTitle(bookId: String): String? {
        val idx = runCatching { bookCache.loadIndex() }.getOrNull() ?: return null
        return idx.books.firstOrNull { it.id == bookId }?.name
    }

    override suspend fun detectCachedFormat(bookId: String): BookFormat? =
        withContext(Dispatchers.IO) {
            if (bookCache.pdfFile(bookId).exists()) return@withContext BookFormat.PDF
            if (bookCache.txtFile(bookId).exists()) return@withContext BookFormat.TXT
            if (bookCache.epubFile(bookId).exists()) return@withContext BookFormat.EPUB
            null
        }

    override suspend fun openEpubBook(bookId: String): EpubBook? {
        val epubFile = bookCache.epubFile(bookId)
        if (!epubFile.exists()) return null

        val extractedDir = bookCache.extractedDir(bookId)
        epubRepository.extractIfNeeded(epubFile = epubFile, extractedDir = extractedDir)
        return epubRepository.loadBook(extractedDir)
    }

    override suspend fun loadChapterContent(bookId: String, chapterHref: String): ChapterContent? {
        val extractedDir = bookCache.extractedDir(bookId)
        val sanitized = epubRepository.loadSanitizedChapterHtml(extractedDir, chapterHref) ?: return null
        val baseUrl = epubRepository.chapterBaseUrl(extractedDir, chapterHref)
        val hash = cryptoPort.sha256Hex(sanitized.bodyHtml)
        return ChapterContent(
            headHtml = sanitized.headHtml,
            bodyHtml = sanitized.bodyHtml,
            baseUrl = baseUrl,
            sourceHash = hash,
        )
    }

    override suspend fun loadBookState(bookId: String): BookState = bookCache.loadState(bookId)

    override suspend fun saveBookState(bookId: String, state: BookState) {
        bookCache.saveState(bookId, state)
    }

    override suspend fun markOpened(bookId: String) {
        bookCache.markOpened(bookId)
    }
}


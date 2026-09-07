package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.domain.reader.BookFormat
import com.progressivereader.kmp.domain.reader.BookState
import com.progressivereader.kmp.domain.reader.ChapterContent
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.ports.CryptoPort
import com.progressivereader.kmp.ports.ReaderPort
import com.progressivereader.kmp.reader.EpubChapter
import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.reader.MobiDocumentParser
import com.progressivereader.kmp.reader.PlainTextDocumentParser
import com.progressivereader.kmp.reader.ReflowableDocument
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AndroidReaderPort(
    private val bookCache: BookCache,
    private val epubRepository: EpubRepository,
    private val cryptoPort: CryptoPort,
) : ReaderPort {
    private val reflowableDocumentsByBookId = HashMap<String, ReflowableDocument>()

    override suspend fun resolveTitle(bookId: String): String? {
        val idx = runCatching { bookCache.loadIndex() }.getOrNull() ?: return null
        return idx.books.firstOrNull { it.id == bookId }?.name
    }

    override suspend fun detectCachedFormat(bookId: String): BookFormat? =
        withContext(Dispatchers.IO) {
            val entry = runCatching { bookCache.loadIndex().books.firstOrNull { it.id == bookId } }.getOrNull()
            val declaredMobi = entry?.let { isMobi(it.mimeType, it.name) } == true
            if (declaredMobi && (bookCache.mobiFile(bookId).exists() || bookCache.epubFile(bookId).exists())) {
                return@withContext BookFormat.MOBI
            }
            if (bookCache.pdfFile(bookId).exists()) return@withContext BookFormat.PDF
            if (bookCache.txtFile(bookId).exists()) return@withContext BookFormat.TXT
            if (bookCache.mobiFile(bookId).exists()) return@withContext BookFormat.MOBI
            if (bookCache.epubFile(bookId).exists()) return@withContext BookFormat.EPUB
            null
        }

    override suspend fun openReflowableBook(
        bookId: String,
        format: BookFormat,
    ): EpubBook? {
        return when (format) {
            BookFormat.EPUB -> {
                reflowableDocumentsByBookId.remove(bookId)
                val epubFile = bookCache.epubFile(bookId)
                if (!epubFile.exists()) return null

                val extractedDir = bookCache.extractedDir(bookId)
                epubRepository.extractIfNeeded(epubFile = epubFile, extractedDir = extractedDir)
                epubRepository.loadBook(extractedDir)
            }
            BookFormat.TXT -> {
                val textFile = bookCache.txtFile(bookId)
                if (!textFile.exists()) return null
                val title = resolveTitle(bookId) ?: "TXT"
                val document = withContext(Dispatchers.IO) { PlainTextDocumentParser.parse(textFile.readBytes(), title) }
                reflowableDocumentsByBookId[bookId] = document
                document.toBook()
            }
            BookFormat.MOBI -> {
                val preferred = bookCache.mobiFile(bookId)
                val mobiFile = if (preferred.exists()) preferred else bookCache.epubFile(bookId)
                if (!mobiFile.exists()) return null
                val title = resolveTitle(bookId) ?: "MOBI"
                val document = withContext(Dispatchers.IO) { MobiDocumentParser.parse(mobiFile.readBytes(), title) }
                reflowableDocumentsByBookId[bookId] = document
                document.toBook()
            }
            BookFormat.PDF -> null
        }
    }

    override suspend fun loadChapterContent(bookId: String, chapterHref: String): ChapterContent? {
        val generated = reflowableDocumentsByBookId[bookId]?.chapters?.firstOrNull { it.href == chapterHref }
        if (generated != null) {
            return ChapterContent(
                headHtml = generated.headHtml,
                bodyHtml = generated.bodyHtml,
                baseUrl = generated.baseUrl,
                sourceHash = cryptoPort.sha256Hex(generated.bodyHtml),
            )
        }

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

    private fun ReflowableDocument.toBook(): EpubBook =
        EpubBook(
            title = title,
            chapters = chapters.map { EpubChapter(href = it.href, title = it.title) },
        )

    private fun isMobi(
        mimeType: String?,
        filename: String,
    ): Boolean {
        val normalizedMime = mimeType?.lowercase()?.trim()
        if (normalizedMime == "application/x-mobipocket-ebook" || normalizedMime?.contains("mobipocket") == true) return true
        return filename.endsWith(".mobi", ignoreCase = true)
    }
}


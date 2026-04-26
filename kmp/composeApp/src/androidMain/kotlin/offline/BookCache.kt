package com.progressivereader.kmp.offline

import android.content.Context
import android.util.AtomicFile
import com.progressivereader.kmp.domain.reader.BookState
import com.progressivereader.kmp.logging.AppLog
import com.progressivereader.kmp.settings.ReaderSettings
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class BooksIndex(
    val version: Int = 1,
    val updatedAt: String,
    val books: List<CachedBookEntry>,
)

@Serializable
data class CachedBookEntry(
    val id: String,
    val name: String,
    val mimeType: String? = null,
    val size: Long? = null,
    val modifiedTime: String? = null,
    val parentFolderId: String? = null,
    val parentFolderName: String? = null,
    val coverPath: String? = null,
    val cachedAt: String,
    val lastOpenedAt: String? = null,
)

class BookCache(private val context: Context) {
    private val writeMutex = Mutex()
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
            prettyPrint = true
        }

    private fun booksRootDir(): File = File(context.filesDir, "books")
    private fun indexFile(): File = File(booksRootDir(), "index.json")
    private fun legacyIndexTmpFile(): File = File(booksRootDir(), "index.json.tmp")
    private fun atomicIndexBakFile(): File = File(booksRootDir(), "index.json.bak")

    fun bookDir(bookId: String): File = File(booksRootDir(), bookId)
    fun epubFile(bookId: String): File = File(bookDir(bookId), "book.epub")
    fun pdfFile(bookId: String): File = File(bookDir(bookId), "book.pdf")
    fun txtFile(bookId: String): File = File(bookDir(bookId), "book.txt")
    fun extractedDir(bookId: String): File = File(bookDir(bookId), "extracted")
    fun stateFile(bookId: String): File = File(bookDir(bookId), "state.json")
    fun coverFile(bookId: String, ext: String = "jpg"): File = File(bookDir(bookId), "cover.$ext")

    fun contentFile(bookId: String, mimeType: String?, filename: String): File =
        when {
            isPdf(mimeType = mimeType, filename = filename) -> pdfFile(bookId)
            isTxt(mimeType = mimeType, filename = filename) -> txtFile(bookId)
            else -> epubFile(bookId)
        }

    fun cachedContentFile(entry: CachedBookEntry): File =
        contentFile(
            bookId = entry.id,
            mimeType = entry.mimeType,
            filename = entry.name,
        )

    fun findCoverFile(bookId: String): File? {
        val dir = bookDir(bookId)
        if (!dir.exists()) return null
        return dir.listFiles()?.firstOrNull { it.isFile && it.name.startsWith("cover.") }
    }

    suspend fun loadIndex(): BooksIndex =
        withContext(Dispatchers.IO) {
            val f = indexFile()
            val candidates = mutableListOf<BooksIndex>()

            fun decodeFromFileOrNull(file: File): BooksIndex? {
                if (!file.exists()) return null
                val text = runCatching { file.readText() }.getOrNull() ?: return null
                return runCatching { json.decodeFromString(BooksIndex.serializer(), text) }.getOrNull()
            }

            decodeFromFileOrNull(f)?.let(candidates::add)
            // If a write was interrupted, AtomicFile leaves a .bak with the last-good contents.
            decodeFromFileOrNull(atomicIndexBakFile())?.let(candidates::add)
            // Legacy writer used a fixed tmp file name; try it as a last resort.
            decodeFromFileOrNull(legacyIndexTmpFile())?.let(candidates::add)

            val best =
                candidates.maxWithOrNull(
                    compareBy<BooksIndex>({ it.books.size }, { it.updatedAt })
                )
            if (best != null) return@withContext best

            // If the index is missing/corrupt, try to recover from on-disk cached books so the
            // library doesn't "disappear" and get overwritten by an empty index.
            val recovered = recoverIndexFromDisk()
            if (recovered.books.isNotEmpty()) {
                AppLog.w("BookCache", "Recovered index.json from disk scan (${recovered.books.size} books).")
                runCatching { saveIndex(recovered) }
            } else if (f.exists()) {
                AppLog.w("BookCache", "Failed to parse index.json and no cached books found on disk.")
            }
            recovered
        }

    suspend fun saveIndex(index: BooksIndex) =
        withContext(Dispatchers.IO) {
            val root = booksRootDir()
            root.mkdirs()
            writeMutex.withLock {
                atomicWrite(
                    target = indexFile(),
                    content = json.encodeToString(BooksIndex.serializer(), index),
                )
            }
        }

    suspend fun loadState(bookId: String): BookState =
        withContext(Dispatchers.IO) {
            val f = stateFile(bookId)
            if (!f.exists()) return@withContext BookState()
            runCatching { json.decodeFromString(BookState.serializer(), f.readText()) }
                .getOrElse { BookState() }
        }

    suspend fun saveState(bookId: String, state: BookState) =
        withContext(Dispatchers.IO) {
            val dir = bookDir(bookId)
            dir.mkdirs()
            writeMutex.withLock {
                atomicWrite(
                    target = stateFile(bookId),
                    content = json.encodeToString(BookState.serializer(), state),
                )
            }
        }

    suspend fun markOpened(bookId: String) {
        val now = nowIsoUtc()
        val current = loadIndex()
        val updated =
            current.copy(
                updatedAt = now,
                books =
                    current.books.map {
                        if (it.id == bookId) it.copy(lastOpenedAt = now) else it
                    },
            )
        saveIndex(updated)
    }

    private fun atomicWrite(target: File, content: String) {
        // Use Android's AtomicFile to avoid partial writes/corruption across crashes or
        // concurrent reads (previous implementation fell back to non-atomic writeText).
        val atomic = AtomicFile(target)
        var os: FileOutputStream? = null
        try {
            os = atomic.startWrite()
            os.write(content.toByteArray(Charsets.UTF_8))
            runCatching { os.fd.sync() }
            atomic.finishWrite(os)
        } catch (t: Throwable) {
            if (os != null) {
                runCatching { atomic.failWrite(os) }
            }
            throw t
        }
    }

    private fun recoverIndexFromDisk(): BooksIndex {
        val root = booksRootDir()
        if (!root.exists()) {
            return BooksIndex(updatedAt = nowIsoUtc(), books = emptyList())
        }

        val entries =
            root.listFiles()
                ?.asSequence()
                ?.filter { it.isDirectory }
                ?.mapNotNull { dir ->
                    val bookId = dir.name
                    val epub = epubFile(bookId)
                    val pdf = pdfFile(bookId)
                    val txt = txtFile(bookId)

                    val content =
                        when {
                            epub.exists() -> epub
                            pdf.exists() -> pdf
                            txt.exists() -> txt
                            else -> null
                        } ?: return@mapNotNull null

                    val mime =
                        when (content.name) {
                            "book.pdf" -> "application/pdf"
                            "book.txt" -> "text/plain"
                            else -> "application/epub+zip"
                        }

                    val displayName =
                        if (content == epub) {
                            readEpubTitleFromExtracted(extractedDir(bookId)) ?: bookId
                        } else {
                            // We no longer have the original Drive filename, so keep a stable identifier.
                            bookId
                        }

                    val cover = findCoverFile(bookId)
                    val lastModified = content.lastModified().takeIf { it > 0L } ?: System.currentTimeMillis()
                    val cachedAt = isoFromEpochMs(lastModified)
                    CachedBookEntry(
                        id = bookId,
                        name = displayName,
                        mimeType = mime,
                        size = content.length().takeIf { it > 0L },
                        // Remote modified time is unknown during recovery; LibraryScreen can reconcile
                        // it from Drive listings when online.
                        modifiedTime = null,
                        parentFolderId = null,
                        parentFolderName = null,
                        coverPath = cover?.name,
                        cachedAt = cachedAt,
                        lastOpenedAt = null,
                    )
                }
                ?.sortedBy { it.name.lowercase(Locale.US) }
                ?.toList()
                ?: emptyList()

        return BooksIndex(updatedAt = nowIsoUtc(), books = entries)
    }

    private fun readEpubTitleFromExtracted(extractedDir: File): String? {
        val container = File(extractedDir, "META-INF/container.xml")
        if (!container.exists()) return null
        val containerXml = runCatching { container.readText() }.getOrNull() ?: return null

        val opfPath =
            Regex("full-path\\s*=\\s*\"([^\"]+)\"")
                .find(containerXml)
                ?.groupValues
                ?.getOrNull(1)
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?: return null

        val opfFile = File(extractedDir, opfPath)
        if (!opfFile.exists()) return null
        val opfXml = runCatching { opfFile.readText() }.getOrNull() ?: return null

        return Regex(
            pattern = "<dc:title[^>]*>(.*?)</dc:title>",
            options = setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        ).find(opfXml)?.groupValues?.getOrNull(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun nowIsoUtc(): String = isoFromEpochMs(System.currentTimeMillis())

    private fun isoFromEpochMs(epochMs: Long): String {
        val fmt =
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
        return fmt.format(Date(epochMs))
    }

    private fun isPdf(mimeType: String?, filename: String): Boolean {
        val mt = mimeType?.lowercase()?.trim()
        if (mt == "application/pdf" || mt?.contains("pdf") == true) return true
        return filename.endsWith(".pdf", ignoreCase = true)
    }

    private fun isTxt(mimeType: String?, filename: String): Boolean {
        val mt = mimeType?.lowercase()?.trim()
        if (mt == "text/plain" || mt?.startsWith("text/") == true) return true
        return filename.endsWith(".txt", ignoreCase = true)
    }
}

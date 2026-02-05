package com.progressivereader.kmp.offline

import android.content.Context
import com.progressivereader.kmp.settings.ReaderSettings
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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

@Serializable
data class BookState(
    val version: Int = 1,
    val lastChapterIndex: Int = 0,
    val bookmarks: List<Bookmark> = emptyList(),
    val readerSettingsOverride: ReaderSettings? = null,
)

@Serializable
data class Bookmark(
    val chapterIndex: Int,
    val label: String? = null,
    val createdAt: String,
)

class BookCache(private val context: Context) {
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
            prettyPrint = true
        }

    private fun booksRootDir(): File = File(context.filesDir, "books")
    private fun indexFile(): File = File(booksRootDir(), "index.json")

    fun bookDir(bookId: String): File = File(booksRootDir(), bookId)
    fun epubFile(bookId: String): File = File(bookDir(bookId), "book.epub")
    fun extractedDir(bookId: String): File = File(bookDir(bookId), "extracted")
    fun stateFile(bookId: String): File = File(bookDir(bookId), "state.json")
    fun coverFile(bookId: String, ext: String = "jpg"): File = File(bookDir(bookId), "cover.$ext")

    fun findCoverFile(bookId: String): File? {
        val dir = bookDir(bookId)
        if (!dir.exists()) return null
        return dir.listFiles()?.firstOrNull { it.isFile && it.name.startsWith("cover.") }
    }

    suspend fun loadIndex(): BooksIndex =
        withContext(Dispatchers.IO) {
            val f = indexFile()
            if (!f.exists()) {
                return@withContext BooksIndex(
                    updatedAt = nowIsoUtc(),
                    books = emptyList(),
                )
            }
            runCatching { json.decodeFromString(BooksIndex.serializer(), f.readText()) }
                .getOrElse {
                    BooksIndex(
                        updatedAt = nowIsoUtc(),
                        books = emptyList(),
                    )
                }
        }

    suspend fun saveIndex(index: BooksIndex) =
        withContext(Dispatchers.IO) {
            val root = booksRootDir()
            root.mkdirs()
            atomicWrite(
                target = indexFile(),
                content = json.encodeToString(BooksIndex.serializer(), index),
            )
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
            atomicWrite(
                target = stateFile(bookId),
                content = json.encodeToString(BookState.serializer(), state),
            )
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
        val tmp = File(target.parentFile, "${target.name}.tmp")
        tmp.writeText(content)
        if (!tmp.renameTo(target)) {
            target.writeText(content)
            tmp.delete()
        }
    }

    private fun nowIsoUtc(): String = isoFromEpochMs(System.currentTimeMillis())

    private fun isoFromEpochMs(epochMs: Long): String {
        val fmt =
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
        return fmt.format(Date(epochMs))
    }
}

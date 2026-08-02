package com.progressivereader.kmp.ui

import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.EpubChapter

internal data class ReaderNavigationEntry(
    val chapterIndex: Int,
    val chapter: EpubChapter,
)

internal fun buildReaderNavigationEntries(book: EpubBook?): List<ReaderNavigationEntry> {
    if (book == null) return emptyList()
    val seen = HashSet<String>()
    return book.chapters.mapIndexedNotNull { index, chapter ->
        if (seen.add(chapter.navigationId)) ReaderNavigationEntry(index, chapter) else null
    }
}

internal fun readerLocationLabel(
    book: EpubBook?,
    chapterIndex: Int,
): String? {
    val chapter = book?.chapters?.getOrNull(chapterIndex) ?: return null
    val navigationEntries = buildReaderNavigationEntries(book)
    val logicalIndex = navigationEntries.indexOfFirst { it.chapter.navigationId == chapter.navigationId }.coerceAtLeast(0)
    val title = chapter.title.ifBlank { "Chapter ${logicalIndex + 1}" }
    return if (chapter.partCount > 1) {
        "$title · ${chapter.partIndex + 1}/${chapter.partCount}"
    } else {
        "$title · ${logicalIndex + 1}/${navigationEntries.size.coerceAtLeast(1)}"
    }
}

internal fun readerProgress(
    book: EpubBook?,
    chapterIndex: Int,
): Float {
    val count = book?.chapters?.size ?: return 0f
    if (count <= 0) return 0f
    return ((chapterIndex + 1).toFloat() / count.toFloat()).coerceIn(0f, 1f)
}

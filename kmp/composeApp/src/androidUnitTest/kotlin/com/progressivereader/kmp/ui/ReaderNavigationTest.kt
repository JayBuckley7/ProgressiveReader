package com.progressivereader.kmp.ui

import com.progressivereader.kmp.reader.EpubBook
import com.progressivereader.kmp.reader.EpubChapter
import kotlin.test.assertEquals
import org.junit.Test

class ReaderNavigationTest {
    private val book =
        EpubBook(
            title = "Test",
            chapters =
                listOf(
                    EpubChapter(href = "intro.xhtml", title = "序章"),
                    EpubChapter(
                        href = "one.xhtml#pr-reader-part=0",
                        title = "第一章",
                        navigationId = "one.xhtml",
                        partIndex = 0,
                        partCount = 2,
                    ),
                    EpubChapter(
                        href = "one.xhtml#pr-reader-part=1",
                        title = "第一章",
                        navigationId = "one.xhtml",
                        partIndex = 1,
                        partCount = 2,
                    ),
                ),
        )

    @Test
    fun navigationUsesOneEntryPerRealEpubChapter() {
        val entries = buildReaderNavigationEntries(book)

        assertEquals(listOf(0, 1), entries.map { it.chapterIndex })
        assertEquals(listOf("序章", "第一章"), entries.map { it.chapter.title })
    }

    @Test
    fun locationShowsVirtualPartWithoutCallingItAnotherChapter() {
        assertEquals("序章 · 1/2", readerLocationLabel(book, 0))
        assertEquals("第一章 · 2/2", readerLocationLabel(book, 2))
        assertEquals(1f, readerProgress(book, 2))
    }
}

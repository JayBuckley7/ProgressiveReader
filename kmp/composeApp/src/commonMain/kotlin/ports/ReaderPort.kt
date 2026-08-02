package com.progressivereader.kmp.ports

import com.progressivereader.kmp.domain.reader.BookFormat
import com.progressivereader.kmp.domain.reader.BookState
import com.progressivereader.kmp.domain.reader.ChapterContent
import com.progressivereader.kmp.reader.EpubBook

interface ReaderPort {
    suspend fun resolveTitle(bookId: String): String?

    suspend fun detectCachedFormat(bookId: String): BookFormat?

    suspend fun openReflowableBook(
        bookId: String,
        format: BookFormat,
    ): EpubBook?

    suspend fun loadChapterContent(
        bookId: String,
        chapterHref: String,
    ): ChapterContent?

    suspend fun loadBookState(bookId: String): BookState

    suspend fun saveBookState(
        bookId: String,
        state: BookState,
    )

    suspend fun markOpened(bookId: String)
}


package com.progressivereader.kmp.reader

data class EpubChapter(
    val href: String,
    val title: String,
)

data class EpubBook(
    val title: String,
    val chapters: List<EpubChapter>,
)

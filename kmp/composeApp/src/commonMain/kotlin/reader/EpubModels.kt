package com.progressivereader.kmp.reader

data class EpubTocItem(
    val title: String,
    val href: String,
    val index: Int
)

data class EpubBook(
    val title: String,
    val chapters: List<String>, // HTML strings
    val toc: List<EpubTocItem>
)



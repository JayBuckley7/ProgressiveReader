package com.progressivereader.kmp.reader

import kotlinx.serialization.Serializable

@Serializable
data class EpubChapter(
    val href: String,
    val title: String,
    val navigationId: String = href,
    val partIndex: Int = 0,
    val partCount: Int = 1,
)

@Serializable
data class EpubBook(
    val title: String,
    val chapters: List<EpubChapter>,
)

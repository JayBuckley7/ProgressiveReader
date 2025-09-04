package com.progressivereader.kmp.reader

expect class EpubParser() {
    suspend fun parse(epubBytes: ByteArray): EpubBook
}



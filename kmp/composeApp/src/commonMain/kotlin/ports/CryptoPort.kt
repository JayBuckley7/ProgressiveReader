package com.progressivereader.kmp.ports

interface CryptoPort {
    fun sha256Hex(text: String): String
}


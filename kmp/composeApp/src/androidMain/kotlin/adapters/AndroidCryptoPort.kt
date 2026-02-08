package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.ports.CryptoPort
import java.security.MessageDigest

class AndroidCryptoPort : CryptoPort {
    override fun sha256Hex(text: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(text.toByteArray(Charsets.UTF_8))
        return bytes.joinToString(separator = "") { b -> "%02x".format(b) }
    }
}


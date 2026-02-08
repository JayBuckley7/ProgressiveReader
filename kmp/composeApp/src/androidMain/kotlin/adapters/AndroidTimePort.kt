package com.progressivereader.kmp.adapters

import com.progressivereader.kmp.ports.TimePort
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class AndroidTimePort : TimePort {
    override fun nowIsoUtc(): String {
        val fmt =
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
        return fmt.format(Date())
    }
}


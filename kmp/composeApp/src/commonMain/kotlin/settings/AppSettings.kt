package com.progressivereader.kmp.settings

data class AppSettings(
    val backendBaseUrl: String = "http://10.0.2.2:5000",
    val driveFolderId: String? = null,
    val reader: ReaderSettings = ReaderSettings(),
)


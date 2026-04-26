package com.progressivereader.kmp.settings

data class AppSettings(
    val backendBaseUrl: String = "https://progressivereader.net",
    val driveFolderId: String? = null,
    val debugMode: Boolean = false,
    val reader: ReaderSettings = ReaderSettings(),
)

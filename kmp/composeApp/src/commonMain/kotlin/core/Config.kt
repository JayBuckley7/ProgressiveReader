package com.progressivereader.kmp.core

object Config {
    // Default backend base URL for emulator; expose in settings to override
    var baseUrl: String = "http://10.0.2.2:5000"
    // Optional Clerk publishable key for native SDK init (Android/iOS)
    var clerkPublishableKey: String? = null
}



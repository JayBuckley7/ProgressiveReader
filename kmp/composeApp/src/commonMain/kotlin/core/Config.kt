package com.progressivereader.kmp.core

object Config {
    // Default to the production Cloud Run API. Emulator/local dev can override this via Settings.
    var baseUrl: String = "https://progressivereader.net"
    // Optional Clerk publishable key for native SDK init (Android/iOS)
    var clerkPublishableKey: String? = null
}


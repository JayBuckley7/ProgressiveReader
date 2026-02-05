package com.progressivereader.kmp

import android.app.Application
import com.clerk.api.Clerk

class ProgressiveReaderApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        val key = BuildConfig.CLERK_PUBLISHABLE_KEY
        if (key.isBlank()) return

        runCatching {
            if (Clerk.isInitialized.value != true) {
                Clerk.initialize(
                    context = applicationContext,
                    publishableKey = key,
                )
            }
        }
    }
}


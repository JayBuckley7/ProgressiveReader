package com.progressivereader.kmp

import android.app.Application
import com.clerk.api.Clerk
import com.progressivereader.kmp.logging.AppLog

class ProgressiveReaderApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppLog.install(applicationContext)
        AppLog.i("App", "Application created.")

        val key = BuildConfig.CLERK_PUBLISHABLE_KEY
        if (key.isBlank()) {
            AppLog.w("Auth", "Clerk publishable key is blank. Native sign-in is disabled.")
            return
        }

        runCatching {
            if (Clerk.isInitialized.value != true) {
                Clerk.initialize(
                    context = applicationContext,
                    publishableKey = key,
                )
                AppLog.i("Auth", "Clerk initialized from application.")
            }
        }.onFailure {
            AppLog.e("Auth", "Failed to initialize Clerk from application.", it)
        }
    }
}


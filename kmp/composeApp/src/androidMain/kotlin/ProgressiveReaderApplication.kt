package com.progressivereader.kmp

import android.app.Application
import com.progressivereader.kmp.auth.ClerkAndroid
import com.progressivereader.kmp.logging.AppLog

class ProgressiveReaderApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppLog.install(applicationContext)
        AppLog.i("App", "Application created.")

        if (!ClerkAndroid.isConfigured) {
            AppLog.w("Auth", "Clerk publishable key is blank. Native sign-in is disabled.")
            return
        }

        ClerkAndroid.initialize(this)
            .onSuccess { AppLog.i("Auth", "Clerk initialization started from application.") }
            .onFailure { AppLog.e("Auth", "Failed to initialize Clerk from application.", it) }
    }
}


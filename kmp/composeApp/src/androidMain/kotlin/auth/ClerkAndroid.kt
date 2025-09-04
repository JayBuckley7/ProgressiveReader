package com.progressivereader.kmp.auth

import android.app.Application
import com.progressivereader.kmp.core.Config

object ClerkAndroid {
    private var initialized = false
    private var tokenProvider: (() -> String?)? = null

    fun initialize(app: Application, provider: () -> String?) {
        // TODO: Initialize Clerk SDK with Config.clerkPublishableKey and hook to session tokens
        tokenProvider = provider
        initialized = true
    }

    fun getSessionToken(): String? = tokenProvider?.invoke()
}



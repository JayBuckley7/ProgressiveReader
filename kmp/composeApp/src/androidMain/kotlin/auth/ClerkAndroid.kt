package com.progressivereader.kmp.auth

import android.content.Context
import android.util.Base64
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.ClerkResult
import com.clerk.api.session.fetchToken
import com.progressivereader.kmp.BuildConfig
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Single owner for Clerk initialization and native session-token access. */
object ClerkAndroid {
    @Volatile
    private var initializationStarted = false

    val isConfigured: Boolean
        get() = BuildConfig.AUTH_CONFIGURED

    @Synchronized
    fun initialize(context: Context): Result<Unit> {
        if (!isConfigured) {
            return Result.failure(IllegalStateException("Missing CLERK_PUBLISHABLE_KEY."))
        }

        return runCatching {
            if (!initializationStarted) {
                Clerk.initialize(
                    context = context.applicationContext,
                    publishableKey = BuildConfig.CLERK_PUBLISHABLE_KEY,
                )
                initializationStarted = true
            }
        }
    }

    suspend fun fetchSessionToken(context: Context): String? {
        if (initialize(context).isFailure) return null
        if (!awaitInitialization()) return null
        val result = runCatching { Clerk.session?.fetchToken() }.getOrNull()
        return (result as? ClerkResult.Success)?.value?.jwt?.takeIf(::isSessionTokenUsable)
    }

    suspend fun signOut() {
        if (initializationStarted && awaitInitialization()) Clerk.signOut()
    }

    private suspend fun awaitInitialization(): Boolean {
        if (Clerk.isInitialized.value == true) return true
        return withTimeoutOrNull(15_000L) { Clerk.isInitialized.first { it } } == true
    }

    fun isSessionTokenUsable(jwt: String): Boolean {
        return (secondsUntilExpiry(jwt) ?: return false) > 15L
    }

    fun secondsUntilExpiry(jwt: String): Long? =
        decodeJwtExpSeconds(jwt)?.minus(System.currentTimeMillis() / 1000L)

    private fun decodeJwtExpSeconds(jwt: String): Long? {
        val payload =
            jwt.split('.')
                .getOrNull(1)
                ?.let { segment ->
                    runCatching {
                        val normalized =
                            segment
                                .replace('-', '+')
                                .replace('_', '/')
                                .let { value -> value + "=".repeat((4 - (value.length % 4)) % 4) }
                        String(Base64.decode(normalized, Base64.DEFAULT), Charsets.UTF_8)
                    }.getOrNull()
                } ?: return null

        return runCatching {
            Json.parseToJsonElement(payload).jsonObject["exp"]?.jsonPrimitive?.content?.toLong()
        }.getOrNull()
    }
}

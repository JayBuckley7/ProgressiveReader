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

    fun subject(jwt: String?): String? = jwt?.let { decodePayload(it)?.get("sub")?.jsonPrimitive?.content?.takeIf { id -> id.isNotBlank() } }

    private fun decodeJwtExpSeconds(jwt: String): Long? = decodePayload(jwt)?.get("exp")?.jsonPrimitive?.content?.toLongOrNull()

    private fun decodePayload(jwt: String): kotlinx.serialization.json.JsonObject? {
        return runCatching {
            val segment = jwt.split('.').getOrNull(1) ?: return null
            val payload = String(Base64.decode(segment, Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8)
            Json.parseToJsonElement(payload).jsonObject
        }.getOrNull()
    }
}

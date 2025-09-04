package com.progressivereader.kmp.auth

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.http.isSuccess
import kotlinx.serialization.Serializable

class AuthService(private val getSessionToken: () -> String?) {
    private val http = createHttpClient()

    @Serializable
    data class AuthStatus(
        val isAuthenticated: Boolean,
        val user: UserInfo? = null
    )

    @Serializable
    data class UserInfo(
        val uid: String,
        val email: String? = null,
        val firstName: String? = null,
        val lastName: String? = null,
        val username: String? = null,
        val imageUrl: String? = null,
    )

    suspend fun authStatus(): AuthStatus? {
        val token = getSessionToken() ?: return null
        val res = http.get("${Config.baseUrl}/auth/status") {
            headers.append("Authorization", "Bearer $token")
        }
        if (!res.status.isSuccess()) return null
        return res.body()
    }
}



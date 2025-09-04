package com.progressivereader.kmp.settings

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

class SettingsService(private val getSessionToken: () -> String?) {
    private val http = createHttpClient()

    suspend fun getSettings(): JsonObject? {
        val token = getSessionToken() ?: return null
        val res = http.get("${Config.baseUrl}/settings") {
            headers.append("Authorization", "Bearer $token")
        }
        if (!res.status.isSuccess()) return null
        return res.body()
    }

    suspend fun saveSettings(obj: JsonObject): Boolean {
        val token = getSessionToken() ?: return false
        val res = http.post("${Config.baseUrl}/settings") {
            headers.append("Authorization", "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(obj)
        }
        return res.status.isSuccess()
    }
}



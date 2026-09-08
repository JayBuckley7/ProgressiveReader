package com.progressivereader.kmp.core

import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class BackendFailure(val code: String, message: String) : Exception(message)

fun decodeBackendFailure(status: Int, body: String): BackendFailure {
    val fields = runCatching { Json.parseToJsonElement(body).jsonObject }.getOrNull()
    val code = fields?.get("code")?.jsonPrimitive?.content ?: "HTTP_$status"
    val message = fields?.get("error")?.jsonPrimitive?.content ?: when (status) {
        401 -> "Sign in again to access cloud records."
        403 -> "This feature is unavailable for this account."
        else -> "Cloud request failed. Your change has not been confirmed."
    }
    return BackendFailure(code, message)
}

suspend fun HttpResponse.requireBackendSuccess() {
    if (!status.isSuccess()) throw decodeBackendFailure(status.value, bodyAsText())
}

fun newSaveIdentifier(): String = List(4) { kotlin.random.Random.nextInt().toUInt().toString(16) }.joinToString("-")

package com.progressivereader.kmp.core

import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

expect fun platformHttpClient(): HttpClient

private const val DefaultRequestTimeoutMillis = 45_000L
private const val DefaultSocketTimeoutMillis = 45_000L
private const val DefaultConnectTimeoutMillis = 5_000L

fun createHttpClient(): HttpClient = platformHttpClient().config {
    install(HttpTimeout) {
        requestTimeoutMillis = DefaultRequestTimeoutMillis
        socketTimeoutMillis = DefaultSocketTimeoutMillis
        connectTimeoutMillis = DefaultConnectTimeoutMillis
    }
    install(ContentNegotiation) {
        json(
            Json {
                ignoreUnknownKeys = true
                isLenient = true
                encodeDefaults = true
            }
        )
    }
}



package com.example.progressivereader.highlight

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

private const val BASE_URL = "https://your-backend.example.com"

/**
 * Basic JPDB API client implemented in Kotlin.
 * The user must provide a valid API key when calling parseText.
 */
object JpdbApi {
    /**
     * Send text segments to the JPDB parsing API and return the resulting tokens.
     * This mirrors the fetch logic from frontend/src/content/api-adapter.ts.
     */
    fun parseText(textSegments: List<String>, apiKey: String): List<Token> {
        require(apiKey.isNotEmpty()) { "JPDB API key must be provided" }

        val url = URL("$BASE_URL/api/get_jpdb_data")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
        }

        val body = JSONObject().apply {
            put("text_segments", JSONArray(textSegments))
            put("jpdb_api_key", apiKey)
        }.toString()

        conn.outputStream.use { it.write(body.toByteArray()) }

        if (conn.responseCode !in 200..299) {
            val error = conn.errorStream?.bufferedReader()?.readText()
            throw RuntimeException("JPDB API error: ${conn.responseCode} $error")
        }

        val response = conn.inputStream.bufferedReader().readText()
        val arr = JSONArray(response)
        return (0 until arr.length()).map { idx ->
            Token.fromJson(arr.getJSONObject(idx))
        }
    }
}

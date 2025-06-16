package com.example.progressivereader.highlight

import com.example.progressivereader.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject


/**
 * Basic JPDB API client implemented in Kotlin.
 * The user must provide a valid API key when calling parseText.
 */
object JpdbApi {
    private val client = OkHttpClient()

    /**
     * Send text segments to the JPDB parsing API and return the resulting tokens.
     * This mirrors the fetch logic from frontend/src/content/api-adapter.ts.
     */
    suspend fun parseText(textSegments: List<String>, apiKey: String): List<Token> =
        withContext(Dispatchers.IO) {
            require(apiKey.isNotEmpty()) { "JPDB API key must be provided" }

            val body = JSONObject().apply {
                put("text_segments", JSONArray(textSegments))
                put("jpdb_api_key", apiKey)
            }.toString()

            val request = Request.Builder()
                .url("${BuildConfig.BACKEND_BASE_URL}/api/get_jpdb_data")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                val error = response.body?.string()
                throw RuntimeException("JPDB API error: ${response.code} $error")
            }

            val arr = JSONArray(response.body!!.string())
            (0 until arr.length()).map { idx ->
                Token.fromJson(arr.getJSONObject(idx))
            }
        }
}

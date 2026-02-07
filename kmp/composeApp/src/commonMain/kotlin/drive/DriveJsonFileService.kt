package com.progressivereader.kmp.drive

import com.progressivereader.kmp.core.createHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.request.patch
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.client.request.parameter
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlin.math.min
import kotlin.random.Random
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Read/update small JSON files stored in the user's Drive app folder.
 *
 * - Reads file content via backend `/drive/download/<id>` (session JWT).
 * - Writes file content via Google Drive "uploadType=media" PATCH using an access token fetched
 *   from backend `/drive/token`.
 *
 * This avoids needing a backend "patch file" endpoint while still keeping all auth centralized in Clerk.
 */
class DriveJsonFileService(
    private val driveService: DriveService,
    private val getDriveFolderOverride: () -> String?,
) {
    data class LocatedFile(
        val folderId: String?,
        val file: DriveService.DriveFile,
    )

    data class LoadedJsonFile(
        val folderId: String?,
        val fileId: String,
        val json: JsonObject,
    )

    private val http: HttpClient = createHttpClient()
    private val json =
        Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            prettyPrint = true
        }

    private val writeMutex = Mutex()

    private var cachedGoogleAccessToken: String? = null
    private var cachedGoogleAccessTokenExpiresAtMs: Long = 0L

    suspend fun resolveAppFolderId(): String? {
        val override = getDriveFolderOverride()?.trim()?.takeIf { it.isNotBlank() }
        if (override != null) return override

        val root = runCatching { driveService.listFiles(folderId = null) }.getOrDefault(emptyList())
        val folder =
            root.firstOrNull { f ->
                f.mimeType?.equals("application/vnd.google-apps.folder", ignoreCase = true) == true &&
                    (f.name.equals("ProgReader", ignoreCase = true) || f.name.equals("ProgressiveReader", ignoreCase = true))
            }
        return folder?.id
    }

    private suspend fun listFilesInAppFolder(folderId: String?): List<DriveService.DriveFile> =
        runCatching { driveService.listFiles(folderId = folderId) }.getOrDefault(emptyList())

    suspend fun locateByName(fileName: String): LocatedFile? {
        val folderId = resolveAppFolderId()
        val files = listFilesInAppFolder(folderId = folderId)

        // If duplicates exist, pick the latest modified time.
        val matches =
            files.filter { it.name.equals(fileName, ignoreCase = true) }
                .sortedWith(
                    compareBy<DriveService.DriveFile> { it.modifiedTime ?: "" }.reversed()
                        .thenBy { it.id }
                )
        val file = matches.firstOrNull() ?: return null
        return LocatedFile(folderId = folderId, file = file)
    }

    suspend fun loadJson(fileName: String): LoadedJsonFile? {
        val located = locateByName(fileName) ?: return null
        val bytes = runCatching { driveService.download(located.file.id) }.getOrNull() ?: return null
        val text = runCatching { bytes.toString(Charsets.UTF_8) }.getOrNull().orEmpty()

        val parsed: JsonObject =
            runCatching {
                val element = json.parseToJsonElement(text)
                (element as? JsonObject) ?: JsonObject(emptyMap())
            }.getOrElse { JsonObject(emptyMap()) }

        return LoadedJsonFile(folderId = located.folderId, fileId = located.file.id, json = parsed)
    }

    suspend fun upsertJson(
        fileName: String,
        defaultJson: JsonObject = JsonObject(emptyMap()),
        mutate: (JsonObject) -> JsonObject,
    ): LoadedJsonFile? =
        writeMutex.withLock {
            val existing = loadJson(fileName)
            val folderId = existing?.folderId ?: resolveAppFolderId()

            val base = existing?.json ?: defaultJson
            val updated = mutate(base)
            val text = json.encodeToString(JsonElement.serializer(), updated)

            val fileId =
                if (existing == null) {
                    val created =
                        driveService.upload(
                            filename = fileName,
                            bytes = text.toByteArray(Charsets.UTF_8),
                            mimeType = "application/json",
                            folderId = folderId,
                        ) ?: return@withLock null
                    created.id
                } else {
                    val ok = updateFileContentWithRetry(fileId = existing.fileId, content = text)
                    if (!ok) return@withLock null
                    existing.fileId
                }

            LoadedJsonFile(folderId = folderId, fileId = fileId, json = updated)
        }

    private suspend fun getGoogleAccessToken(): String? {
        val now = System.currentTimeMillis()
        val cached = cachedGoogleAccessToken
        if (!cached.isNullOrBlank() && now + 30_000 < cachedGoogleAccessTokenExpiresAtMs) return cached

        val res = driveService.requestGoogleAccessToken() ?: return null
        val token = res.access_token.trim()
        if (token.isBlank()) return null
        cachedGoogleAccessToken = token
        cachedGoogleAccessTokenExpiresAtMs = now + (res.expires_in.coerceAtLeast(0) * 1000L)
        return token
    }

    private fun shouldRetry(status: Int): Boolean = status == 429 || status in 500..599

    private fun computeRetryDelayMs(attempt: Int, retryAfterHeader: String?): Long {
        retryAfterHeader?.toDoubleOrNull()?.takeIf { it >= 0 }?.let { sec ->
            return min(30_000L, maxOf(250L, (sec * 1000.0).toLong()))
        }

        val base = 250L * (1L shl (attempt - 1).coerceAtMost(8))
        val jitter = 0.2 + Random.nextDouble() * 0.3 // 20-50%
        return min(10_000L, (base * (1.0 + jitter)).toLong())
    }

    private suspend fun updateFileContentWithRetry(fileId: String, content: String): Boolean {
        val maxAttempts = 5

        for (attempt in 1..maxAttempts) {
            val token = getGoogleAccessToken() ?: return false

            val res =
                runCatching {
                    http.patch {
                        url("https://www.googleapis.com/upload/drive/v3/files/$fileId")
                        parameter("uploadType", "media")
                        headers.append(HttpHeaders.Authorization, "Bearer $token")
                        contentType(ContentType.Application.Json)
                        setBody(content)
                    }
                }.getOrNull()

            if (res == null) {
                if (attempt == maxAttempts) return false
                delay(computeRetryDelayMs(attempt, null))
                continue
            }

            if (res.status.isSuccess()) return true

            // Refresh token on auth errors, then retry.
            if (res.status.value == 401 || res.status.value == 403) {
                cachedGoogleAccessToken = null
                cachedGoogleAccessTokenExpiresAtMs = 0L
                if (attempt == maxAttempts) return false
                delay(computeRetryDelayMs(attempt, res.headers[HttpHeaders.RetryAfter]))
                continue
            }

            val body = runCatching { res.bodyAsText() }.getOrNull().orEmpty()
            if (!shouldRetry(res.status.value) || attempt == maxAttempts) {
                // Callers should surface a user-visible error. Keep response in a named local so
                // it can be inspected while debugging without requiring compiler flags.
                @Suppress("UNUSED_VARIABLE") val ignoredBody = body
                return false
            }

            delay(computeRetryDelayMs(attempt, res.headers[HttpHeaders.RetryAfter]))
        }

        return false
    }
}

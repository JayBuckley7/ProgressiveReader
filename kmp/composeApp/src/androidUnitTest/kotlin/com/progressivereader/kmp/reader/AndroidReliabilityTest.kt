package com.progressivereader.kmp.reader

import com.progressivereader.kmp.core.Config
import com.progressivereader.kmp.drive.DriveJsonFileService
import com.progressivereader.kmp.drive.DriveService
import com.progressivereader.kmp.reader.EpubRepository
import com.progressivereader.kmp.vocabulary.VocabularyService
import com.progressivereader.kmp.jpdbMirror.syncJpdbKnownMirror
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.assertFailsWith
import com.progressivereader.kmp.core.BackendFailure

/** Failure-injection checks use local fixtures only; never call a real account. */
class AndroidReliabilityTest {
    @Test fun disabledGrammarAiMakesZeroBackendRequests() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var requests = 0
        server.createContext("/") { exchange -> requests++; exchange.sendResponseHeaders(500, -1); exchange.close() }
        val previous = Config.baseUrl
        server.start()
        try {
            Config.baseUrl = "http://127.0.0.1:${server.address.port}"
            val info = com.progressivereader.kmp.grammar.GrammarApiService.GrammarInfo("fixture", "test", "test", "n5")
            val signedIn = com.progressivereader.kmp.grammar.GrammarApiService { "fixture-token" }
            val guest = com.progressivereader.kmp.grammar.GrammarApiService { null }
            assertEquals("SERVER_AI_DISABLED", assertFailsWith<BackendFailure> {
                signedIn.validateExamples(com.progressivereader.kmp.grammar.GrammarApiService.ValidateExamplesRequest(info, emptyList()))
            }.code)
            assertEquals("SERVER_AI_DISABLED", assertFailsWith<BackendFailure> {
                signedIn.teachExamples(com.progressivereader.kmp.grammar.GrammarApiService.TeachExamplesRequest(info, emptyList()))
            }.code)
            assertEquals("AUTH_REQUIRED", assertFailsWith<BackendFailure> {
                guest.validateExamples(com.progressivereader.kmp.grammar.GrammarApiService.ValidateExamplesRequest(info, emptyList(), apiKey = "fixture-key"))
            }.code)
            assertEquals(0, requests)
        } finally { Config.baseUrl = previous; server.stop(0) }
    }

    @Test fun confirmedMissingGrammarFileCanBeCreated() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var uploads = 0
        var uploaded = ""
        server.createContext("/drive/files") { exchange ->
            val body = "[]".toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, body.size.toLong()); exchange.responseBody.use { it.write(body) }
        }
        server.createContext("/drive/upload") { exchange ->
            uploads++; uploaded = exchange.requestBody.bufferedReader().readText()
            val body = """{"id":"fixture","name":"grammar.json"}""".toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, body.size.toLong()); exchange.responseBody.use { it.write(body) }
        }
        val previous = Config.baseUrl
        server.start()
        try {
            Config.baseUrl = "http://127.0.0.1:${server.address.port}"
            val service = DriveJsonFileService(DriveService { "fixture-token" }) { "fixture-folder" }
            assertEquals(null, com.progressivereader.kmp.grammar.loadGrammarFromDrive(service))
            assertTrue(com.progressivereader.kmp.grammar.saveGrammarToDrive(service, setOf("pattern"), emptySet(), emptyMap(), mapOf("pattern" to com.progressivereader.kmp.grammar.GrammarProgressChange("known", "edit"))))
            assertEquals(1, uploads)
            assertTrue(uploaded.contains("pattern"))
        } finally { Config.baseUrl = previous; server.stop(0) }
    }

    @Test fun failedJpdbRefreshCannotReplaceTheLastGoodSnapshot() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/list-user-decks") { exchange ->
            exchange.requestBody.use { it.readBytes() }
            exchange.sendResponseHeaders(503, -1)
            exchange.close()
        }
        val previous = Config.baseUrl
        server.start()
        try {
            Config.baseUrl = "http://127.0.0.1:${server.address.port}"
            assertFailsWith<BackendFailure> { syncJpdbKnownMirror(VocabularyService { "fixture-token" }, "fixture-jpdb-key") }
            Unit
        } finally { Config.baseUrl = previous; server.stop(0) }
    }

    @Test fun epubSanitizerRemovesExecutableAttributes() = runBlocking {
        val root = Files.createTempDirectory("pr-audit-html").toFile()
        File(root, "chapter.xhtml").writeText("""<html><body><p>Reading text.</p><img src="missing.png" onerror="document.body.dataset.audit='executed'"><a href="javascript:void(0)">link</a></body></html>""")
        val html = assertNotNull(EpubRepository().loadSanitizedChapterHtml(root, "chapter.xhtml")).bodyHtml
        assertTrue(!html.contains("onerror="))
        assertTrue(!html.contains("javascript:void(0)"))
    }

    @Test fun partialEpubExtractionIsRebuiltFromTheOriginalArchive() = runBlocking {
        val root = Files.createTempDirectory("pr-audit-extract").toFile()
        val container = """<container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>"""
        val archive = File(root, "book.epub")
        ZipOutputStream(archive.outputStream()).use { zip ->
            mapOf("META-INF/container.xml" to container, "OPS/content.opf" to "<package><metadata/><manifest/><spine/></package>").forEach { (name, body) ->
                zip.putNextEntry(ZipEntry(name)); zip.write(body.toByteArray()); zip.closeEntry()
            }
        }
        val extracted = File(root, "extracted")
        File(extracted, "META-INF").mkdirs()
        File(extracted, "META-INF/container.xml").writeText(container)
        EpubRepository().extractIfNeeded(archive, extracted)
        assertTrue(File(extracted, "OPS/content.opf").exists())
        assertTrue(File(extracted, ".extraction-complete").isFile)
        assertTrue(EpubRepository().loadBook(extracted).chapters.isEmpty())
    }

    @Test fun corruptDriveJsonCannotBeUsedAsAnEmptyBase() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/drive/files") { exchange ->
            val body = """[{"id":"fixture-file","name":"grammar.json"}]""".toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        server.createContext("/drive/download/fixture-file") { exchange ->
            val body = "{broken-json".toByteArray()
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        val previous = Config.baseUrl
        server.start()
        try {
            Config.baseUrl = "http://127.0.0.1:${server.address.port}"
            val service = DriveJsonFileService(DriveService { "fixture-token" }) { "fixture-folder" }
            val error = assertFailsWith<BackendFailure> { service.loadJson("grammar.json") }
            assertEquals("DRIVE_DATA_CORRUPT", error.code)
        } finally { Config.baseUrl = previous; server.stop(0) }
    }

    @Test fun failedDriveDiscoveryDoesNotUploadReplacementCollections() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var uploads = 0
        server.createContext("/drive/files") { exchange ->
            exchange.sendResponseHeaders(503, -1)
            exchange.close()
        }
        server.createContext("/drive/upload") { exchange ->
            uploads++
            exchange.requestBody.use { it.readBytes() }
            val body = """{"id":"duplicate-fixture-file","name":"metadata.json"}""".toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        val previous = Config.baseUrl
        server.start()
        try {
            Config.baseUrl = "http://127.0.0.1:${server.address.port}"
            val service = DriveJsonFileService(DriveService { "fixture-token" }) { "fixture-folder" }
            assertFailsWith<BackendFailure> { service.upsertJson("metadata.json") { JsonObject(mapOf("fixture" to JsonPrimitive(true))) } }
            assertEquals(0, uploads)
        } finally { Config.baseUrl = previous; server.stop(0) }
    }
}

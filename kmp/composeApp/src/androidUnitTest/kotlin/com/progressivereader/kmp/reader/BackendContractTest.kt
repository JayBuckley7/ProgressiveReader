package com.progressivereader.kmp.reader

import com.progressivereader.kmp.core.decodeBackendFailure
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class BackendContractTest {
    @Test fun bookmarkIdsAcceptExistingNumericAndStringResponses() {
        val base = "\"bookId\":\"book\",\"chapterIndex\":2,\"position\":42"
        assertEquals("17", Json.decodeFromString<BookmarksService.Bookmark>("{\"id\":17,$base}").id)
        assertEquals("17", Json.decodeFromString<BookmarksService.Bookmark>("{\"id\":\"17\",$base}").id)
    }

    @Test fun disabledAiAndMigrationMessagesArePreserved() {
        val disabled = decodeBackendFailure(403, """{"code":"SERVER_AI_DISABLED","error":"Use your own AI key."}""")
        assertEquals("SERVER_AI_DISABLED", disabled.code)
        assertEquals("Use your own AI key.", disabled.message)
        assertEquals("MIGRATION_REQUIRED", decodeBackendFailure(409, """{"code":"MIGRATION_REQUIRED","error":"Keep local drafts."}""").code)
    }
}

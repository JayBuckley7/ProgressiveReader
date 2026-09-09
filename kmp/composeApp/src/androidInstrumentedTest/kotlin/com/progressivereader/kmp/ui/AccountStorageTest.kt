package com.progressivereader.kmp.ui

import android.content.Context
import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import com.progressivereader.kmp.session.AccountStorage
import com.progressivereader.kmp.settings.AppSettingsStore
import com.progressivereader.kmp.grammar.GrammarStore
import java.io.File
import java.util.UUID
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.Assert.*

class AccountStorageTest {
    private fun fixture(): Context {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val dir = File(app.cacheDir, "account-test-${UUID.randomUUID()}").apply { mkdirs() }
        return object : ContextWrapper(app) {
            override fun getApplicationContext(): Context = this
            override fun getFilesDir(): File = dir
        }
    }

    @Test fun approvedLegacyClaimSeparatesBooksSettingsAndGrammar() = runBlocking {
        val base = fixture()
        File(base.filesDir, "books").mkdirs()
        File(base.filesDir, "books/original.epub").writeText("original fixture")
        AppSettingsStore(base).setReaderOpenAiApiKey("fixture-key")
        GrammarStore(base).setKnown("n5:fixture", true)
        assertTrue(AccountStorage.needsLegacyClaim(base))
        AccountStorage.claimLegacy(base, "account-a")
        val a = AccountStorage.context(base, "account-a")
        val b = AccountStorage.context(base, "account-b")
        val guest = AccountStorage.context(base, null)
        assertEquals("original fixture", File(a.filesDir, "books/original.epub").readText())
        for (other in listOf(b, guest)) {
            assertFalse(File(other.filesDir, "books/original.epub").exists())
            assertNull(AppSettingsStore(other).settingsFlow.first().reader.openAiApiKey)
            assertTrue(GrammarStore(other).stateFlow.first().knownIds.isEmpty())
        }
        assertEquals("fixture-key", AppSettingsStore(AccountStorage.context(base, "account-a")).settingsFlow.first().reader.openAiApiKey)
        assertEquals(setOf("n5:fixture"), GrammarStore(a).stateFlow.first().knownIds)
    }

    @Test fun pendingRemovalSurvivesStoreRecreationAndLateAcknowledgement() = runBlocking {
        val context = fixture()
        val store = GrammarStore(context)
        store.mergeCloudProgress(setOf("pattern"), emptySet())
        store.setKnown("pattern", false)
        val removed = store.stateFlow.first().pendingChanges
        val reopened = GrammarStore(context)
        reopened.mergeCloudProgress(setOf("pattern", "other"), emptySet())
        assertEquals(setOf("other"), reopened.stateFlow.first().knownIds)
        reopened.setLearning("pattern", true)
        reopened.acknowledge(removed)
        val state = reopened.stateFlow.first()
        assertEquals("learning", state.pendingChanges["pattern"]?.state)
        assertEquals(setOf("pattern"), state.learningIds)
        reopened.acknowledge(state.pendingChanges)
        assertTrue(reopened.stateFlow.first().pendingChanges.isEmpty())
    }
}

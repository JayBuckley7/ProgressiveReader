package com.progressivereader.kmp.reader

import com.progressivereader.kmp.session.AccountStorage
import com.progressivereader.kmp.grammar.*
import java.io.File
import kotlin.test.*
import org.junit.Test

class AccountAndGrammarTest {
    @Test fun `approved owner retains legacy files while guest and other accounts are separate`() {
        val base = File("test-root").absoluteFile
        assertEquals(base, AccountStorage.rootFor(base, "owner-a", "owner-a"))
        val other = AccountStorage.rootFor(base, "owner-b", "owner-a")
        val guest = AccountStorage.rootFor(base, null, "owner-a")
        assertNotEquals(base, other)
        assertNotEquals(other, guest)
        assertEquals(other, AccountStorage.rootFor(base, "owner-b", "owner-a"))
        assertTrue(AccountStorage.rootFor(base, "../../outside", null).canonicalPath.startsWith(File(base, "profiles").canonicalPath))
    }

    @Test fun `offline removal survives cloud restore and preserves unrelated patterns`() {
        val pending = mapOf("removed" to GrammarProgressChange("none", "edit-1"), "moved" to GrammarProgressChange("learning", "edit-2"))
        val (known, learning) = mergeGrammarProgress(setOf("removed", "moved", "other"), setOf("remote-learning"), pending)
        assertEquals(setOf("other"), known)
        assertEquals(setOf("moved", "remote-learning"), learning)
    }

    @Test fun `late save acknowledgement cannot discard a newer offline edit`() {
        val old = GrammarProgressChange("known", "one")
        val newer = GrammarProgressChange("none", "two")
        assertEquals(mapOf("pattern" to newer), remainingGrammarChanges(mapOf("pattern" to newer), mapOf("pattern" to old)))
        assertTrue(remainingGrammarChanges(mapOf("pattern" to old), mapOf("pattern" to old)).isEmpty())
    }
}

package com.progressivereader.kmp.ui

import com.progressivereader.kmp.navigation.Screen
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.Test

class ShellChromeModelTest {
    @Test
    fun `library screen shows bottom bar and selects library`() {
        val chrome = shellChromeFor(Screen.Library)

        assertTrue(chrome.showBottomBar)
        assertEquals("Library", chrome.selectedDestination?.label)
    }

    @Test
    fun `reader screen hides bottom bar`() {
        val chrome = shellChromeFor(Screen.Reader(bookId = "demo"))

        assertFalse(chrome.showBottomBar)
        assertNull(chrome.selectedDestination)
    }

    @Test
    fun `settings screen only shows bottom bar for root settings route`() {
        val rootChrome = shellChromeFor(Screen.Settings(showBack = false))
        val pushedChrome = shellChromeFor(Screen.Settings(showBack = true))

        assertTrue(rootChrome.showBottomBar)
        assertEquals("Settings", rootChrome.selectedDestination?.label)
        assertFalse(pushedChrome.showBottomBar)
        assertNull(pushedChrome.selectedDestination)
    }
}

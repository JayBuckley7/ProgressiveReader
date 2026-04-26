package com.progressivereader.kmp.ui

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import com.progressivereader.kmp.navigation.Screen
import org.junit.Rule
import org.junit.Test

class ShellBottomBarTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun bottomBarShowsForLibraryAndRootSettings() {
        renderShellHost(Screen.Library)
        rule.onAllNodesWithTag(UiTestTags.shellBottomBar).assertCountEquals(1)
        rule.onAllNodesWithTag(UiTestTags.shellDestination("Library")).assertCountEquals(1)

        renderShellHost(Screen.Settings(showBack = false))
        rule.onAllNodesWithTag(UiTestTags.shellBottomBar).assertCountEquals(1)
        rule.onAllNodesWithTag(UiTestTags.shellDestination("Settings")).assertCountEquals(1)
    }

    @Test
    fun bottomBarHidesForReaderAndPushedSettings() {
        renderShellHost(Screen.Reader(bookId = "demo"))
        rule.onAllNodesWithTag(UiTestTags.shellBottomBar).assertCountEquals(0)

        renderShellHost(Screen.Settings(showBack = true))
        rule.onAllNodesWithTag(UiTestTags.shellBottomBar).assertCountEquals(0)
    }

    private fun renderShellHost(screen: Screen) {
        rule.setContent {
            ProgressiveReaderTheme(theme = "light") {
                if (shellChromeFor(screen).showBottomBar) {
                    ShellBottomBar(current = screen, onSelect = {})
                }
            }
        }
    }
}

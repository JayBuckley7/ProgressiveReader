package com.progressivereader.kmp.ui

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import com.progressivereader.kmp.navigation.Screen
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import org.junit.Rule
import org.junit.Test

class ShellBottomBarTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun bottomBarShowsForLibraryAndRootSettings() {
        val current = renderShellHost(Screen.Library)
        rule.onAllNodesWithTag(UiTestTags.shellBottomBar).assertCountEquals(1)
        rule.onAllNodesWithTag(UiTestTags.shellDestination("Library")).assertCountEquals(1)

        rule.runOnIdle { current.value = Screen.Settings(showBack = false) }
        rule.onAllNodesWithTag(UiTestTags.shellBottomBar).assertCountEquals(1)
        rule.onAllNodesWithTag(UiTestTags.shellDestination("More")).assertCountEquals(1)
    }

    @Test
    fun bottomBarHidesForReaderAndPushedSettings() {
        val current = renderShellHost(Screen.Reader(bookId = "demo"))
        rule.onAllNodesWithTag(UiTestTags.shellBottomBar).assertCountEquals(0)

        rule.runOnIdle { current.value = Screen.Settings(showBack = true) }
        rule.onAllNodesWithTag(UiTestTags.shellBottomBar).assertCountEquals(0)
    }

    private fun renderShellHost(screen: Screen): MutableState<Screen> {
        val current = mutableStateOf(screen)
        rule.setContent {
            ProgressiveReaderTheme(theme = "light") {
                val displayedScreen = current.value
                if (shellChromeFor(displayedScreen).showBottomBar) {
                    ShellBottomBar(current = displayedScreen, onSelect = {})
                }
            }
        }
        return current
    }
}

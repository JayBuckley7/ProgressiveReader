package com.progressivereader.kmp.ui

import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.progressivereader.kmp.domain.library.CachedBook
import com.progressivereader.kmp.domain.library.DriveFile
import com.progressivereader.kmp.domain.library.LibraryIndex
import com.progressivereader.kmp.ui.viewmodels.LibraryUiState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class LibraryScreenTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun guestModeShowsBannerInsteadOfSignedOutLandingWhenCachedBooksExist() {
        renderLibrary(
            state =
                LibraryUiState(
                    isOnline = true,
                    sessionJwt = null,
                    cachedIndex =
                        LibraryIndex(
                            updatedAt = "now",
                            books = listOf(CachedBook(id = "cached-1", name = "Cached_Title.epub", cachedAt = "now")),
                        ),
                ),
        )

        rule.onAllNodesWithTag(UiTestTags.libraryBannerGuest).assertCountEquals(1)
        rule.onAllNodesWithTag(UiTestTags.librarySignedOutState).assertCountEquals(0)
    }

    @Test
    fun bookTilesExposeExpectedActionsAndTapBehavior() {
        val opened = mutableListOf<String>()
        val downloads = mutableListOf<String>()

        renderLibrary(
            state =
                LibraryUiState(
                    isOnline = true,
                    sessionJwt = "jwt",
                    remoteFiles =
                        listOf(
                            DriveFile(id = "cached", name = "Cached_Book.epub", size = 1_024),
                            DriveFile(id = "remote", name = "Remote_Only.epub", size = 2_048),
                            DriveFile(id = "stale", name = "Stale_Copy (1).epub", modifiedTime = "new", size = 4_096),
                        ),
                    cachedIndex =
                        LibraryIndex(
                            updatedAt = "now",
                            books =
                                listOf(
                                    CachedBook(id = "cached", name = "Cached_Book.epub", modifiedTime = "same", cachedAt = "now"),
                                    CachedBook(id = "stale", name = "Stale_Copy (1).epub", modifiedTime = "old", cachedAt = "now"),
                                ),
                        ),
                ),
            onOpenReader = { opened += it },
            onDownload = { file, _, _, _ -> downloads += file.id },
        )

        rule.onNodeWithTag(UiTestTags.libraryTile("cached")).assertHasClickAction().performClick()
        rule.onNodeWithTag(UiTestTags.libraryTile("remote")).assertHasNoClickAction()
        rule.onNodeWithTag(UiTestTags.libraryTile("stale")).assertHasClickAction()

        rule.onNodeWithTag(UiTestTags.libraryPrimaryAction("cached")).assertIsDisplayed()
        rule.onNodeWithTag(UiTestTags.libraryPrimaryAction("cached")).assertTextEquals("Read")
        rule.onAllNodesWithTag(UiTestTags.libraryPrimaryAction("remote")).assertCountEquals(0)
        rule.onNodeWithTag(UiTestTags.libraryPrimaryAction("stale")).assertTextEquals("Read")
        rule.onNodeWithText("Update").assertExists()
        rule.onNodeWithTag(UiTestTags.libraryOverflowMenu("remote")).performClick()
        rule.onNodeWithTag(UiTestTags.libraryOverflowAction("remote", "download")).assertIsDisplayed().performClick()

        assertEquals(listOf("cached"), opened)
        assertEquals(listOf("remote"), downloads)
    }

    private fun renderLibrary(
        state: LibraryUiState,
        onOpenReader: (String) -> Unit = {},
        onDownload: (DriveFile, Boolean, String?, String?) -> Unit = { _, _, _, _ -> },
    ) {
        rule.setContent {
            ProgressiveReaderTheme(theme = "light") {
                LibraryScreen(
                    state = state,
                    snackbarHostState = SnackbarHostState(),
                    onOpenReader = onOpenReader,
                    onOpenSettings = {},
                    onOpenLogin = {},
                    onRefreshDrive = {},
                    onImportUri = {},
                    onDownload = onDownload,
                    onEnsureRemoteCover = { _, _ -> },
                    onCreateFolder = {},
                    onRenameFolder = { _, _ -> },
                    onDeleteFolder = {},
                    onMoveBookToFolder = { _, _ -> },
                    onSetCover = { _, _ -> },
                    onRemoveCover = {},
                )
            }
        }
    }
}

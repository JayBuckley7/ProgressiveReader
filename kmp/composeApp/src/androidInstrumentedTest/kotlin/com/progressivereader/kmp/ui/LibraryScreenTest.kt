package com.progressivereader.kmp.ui

import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
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

        rule.onNodeWithTag(UiTestTags.libraryCover("cached")).assertHasClickAction().performClick()
        rule.onNodeWithTag(UiTestTags.libraryCover("remote")).assertHasClickAction().performClick()
        rule.onNodeWithTag(UiTestTags.libraryCover("stale")).assertHasClickAction()

        rule.onNodeWithTag(UiTestTags.libraryOverflowMenu("remote")).performClick()
        rule.onNodeWithTag(UiTestTags.libraryOverflowAction("remote", "download")).assertTextEquals("Download")
        assertEquals(listOf("cached"), opened)
        assertEquals(listOf("remote"), downloads)
    }

    @Test
    fun downloadFailureStaysOnTheBookAndOffersRetry() {
        val downloads = mutableListOf<String>()
        renderLibrary(
            state =
                LibraryUiState(
                    sessionJwt = "jwt",
                    remoteFiles = listOf(DriveFile(id = "remote", name = "Remote.epub", size = 2_048)),
                    cachedIndex = LibraryIndex(updatedAt = "now", books = emptyList()),
                    downloadErrorByBookId = mapOf("remote" to "Couldn't download this book."),
                ),
            onDownload = { file, _, _, _ -> downloads += file.id },
        )

        rule.onNodeWithText("Download failed \u2022 EPUB \u2022 2 KB").assertIsDisplayed()
        rule.onNodeWithTag(UiTestTags.libraryCoverStatus("remote")).assertIsDisplayed()
        rule.onNodeWithText("Tap to retry").assertIsDisplayed()
        rule.onNodeWithTag(UiTestTags.libraryCover("remote")).performClick()
        rule.onNodeWithTag(UiTestTags.libraryOverflowMenu("remote")).performClick()
        rule.onNodeWithTag(UiTestTags.libraryOverflowAction("remote", "download")).assertTextEquals("Retry download").performClick()

        assertEquals(listOf("remote", "remote"), downloads)
    }

    @Test
    fun activeDownloadKeepsProgressAnchoredToTheCover() {
        renderLibrary(
            state =
                LibraryUiState(
                    sessionJwt = "jwt",
                    remoteFiles = listOf(DriveFile(id = "remote", name = "Remote.epub", size = 2_048)),
                    cachedIndex = LibraryIndex(updatedAt = "now", books = emptyList()),
                    downloadingId = "remote",
                ),
        )

        rule.onNodeWithTag(UiTestTags.libraryCoverStatus("remote")).assertIsDisplayed()
        rule.onNodeWithText("Getting ready…").assertIsDisplayed()
        rule.onNodeWithText("Getting ready \u2022 EPUB \u2022 2 KB").assertIsDisplayed()
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

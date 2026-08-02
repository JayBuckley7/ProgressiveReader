package com.progressivereader.kmp.ui

import com.progressivereader.kmp.domain.library.CachedBook
import com.progressivereader.kmp.domain.library.DriveFile
import com.progressivereader.kmp.domain.library.LibraryIndex
import com.progressivereader.kmp.ui.viewmodels.LibraryUiState
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Test

class LibraryPresentationTest {
    @Test
    fun `cleanLibraryDisplayTitle strips separators extension and duplicate suffix`() {
        assertEquals(
            "Isles of the Emberdark",
            cleanLibraryDisplayTitle("Isles_of_the_Emberdark (1).epub"),
        )
        assertEquals(
            "DCC1",
            cleanLibraryDisplayTitle("DCC1.epub"),
        )
        assertEquals(
            "Volume 12 Final",
            cleanLibraryDisplayTitle("Volume-12__Final.pdf"),
        )
    }

    @Test
    fun `presentDriveShelves keeps my books first then folders then local only`() {
        val state =
            LibraryUiState(
                remoteFiles =
                    listOf(
                        DriveFile(id = "book-a", name = "Alpha.epub"),
                        DriveFile(id = "book-b", name = "Beta.epub"),
                    ),
                cachedIndex =
                    LibraryIndex(
                        updatedAt = "now",
                        books =
                            listOf(
                                CachedBook(
                                    id = "local-book",
                                    name = "Offline_Copy.epub",
                                    cachedAt = "now",
                                ),
                            ),
                    ),
                virtualFolderNameById = mapOf("folder-2" to "Zeta", "folder-1" to "Archive"),
                virtualFolderIdByBookId = mapOf("book-b" to "folder-1"),
            )

        val shelves = presentDriveShelves(state)

        assertEquals(listOf("My Books", "Archive", "Zeta", "On this device"), shelves.map { it.title })
        assertEquals(listOf("book-a"), shelves.first().books.map { it.file.id })
        assertEquals(listOf("book-b"), shelves[1].books.map { it.file.id })
        assertEquals(listOf("local-book"), shelves.last().books.map { it.file.id })
    }

    @Test
    fun `presentCachedShelves groups by folder name with my books first`() {
        val shelves =
            presentCachedShelves(
                cachedIndex =
                    LibraryIndex(
                        updatedAt = "now",
                        books =
                            listOf(
                                CachedBook(id = "a", name = "Alpha.epub", parentFolderName = "Study", cachedAt = "now"),
                                CachedBook(id = "b", name = "Beta.epub", cachedAt = "now"),
                            ),
                    ),
                localCoverPathByBookId = emptyMap(),
            )

        assertEquals(listOf("My Books", "Study"), shelves.map { it.title })
        assertTrue(shelves.first().books.any { it.file.id == "b" })
        assertTrue(shelves.last().books.any { it.file.id == "a" })
    }

    @Test
    fun `presentBook identifies uncached Drive books explicitly`() {
        val book =
            presentDriveShelves(
                LibraryUiState(
                    remoteFiles = listOf(DriveFile(id = "book-a", name = "Alpha.epub", size = 11_300_000)),
                ),
            ).first().books.first()

        assertEquals("In Drive", book.availabilityLabel)
        assertEquals("EPUB • 10.8 MB", book.detailLine)
    }
}

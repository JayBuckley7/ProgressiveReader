package com.progressivereader.kmp.ui

internal object UiTestTags {
    const val shellBottomBar = "shell-bottom-bar"
    const val libraryActionFolders = "library-action-folders"
    const val libraryActionRefresh = "library-action-refresh"
    const val libraryActionImport = "library-action-import"
    const val libraryActionSignIn = "library-action-sign-in"
    const val libraryBannerOffline = "library-banner-offline"
    const val libraryBannerGuest = "library-banner-guest"
    const val libraryBannerDriveUnavailable = "library-banner-drive-unavailable"
    const val librarySignedOutState = "library-signed-out-state"
    const val libraryEmptyState = "library-empty-state"

    fun shellDestination(label: String): String = "shell-destination-${label.slugify()}"

    fun libraryShelf(title: String): String = "library-shelf-${title.slugify()}"

    fun libraryTile(bookId: String): String = "library-book-tile-${bookId.slugify()}"

    fun libraryCover(bookId: String): String = "library-book-cover-${bookId.slugify()}"

    fun libraryCoverStatus(bookId: String): String = "library-book-cover-status-${bookId.slugify()}"

    fun libraryOverflowMenu(bookId: String): String = "library-book-overflow-${bookId.slugify()}"

    fun libraryOverflowAction(bookId: String, action: String): String =
        "library-book-overflow-${bookId.slugify()}-${action.slugify()}"
}

private fun String.slugify(): String =
    lowercase()
        .replace(Regex("[^a-z0-9]+"), "-")
        .trim('-')
        .ifBlank { "item" }

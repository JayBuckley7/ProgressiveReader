package com.progressivereader.kmp.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoFixHigh
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Style
import androidx.compose.ui.graphics.vector.ImageVector
import com.progressivereader.kmp.navigation.Screen

internal data class ShellDestinationSpec(
    val label: String,
    val shortLabel: String,
    val icon: ImageVector,
    val target: Screen,
    val matches: (Screen) -> Boolean,
)

internal data class ShellChromeSpec(
    val showBottomBar: Boolean,
    val selectedDestination: ShellDestinationSpec? = null,
)

internal val shellDestinations =
    listOf(
        ShellDestinationSpec(
            label = "Library",
            shortLabel = "Library",
            icon = Icons.Outlined.MenuBook,
            target = Screen.Library,
            matches = { it is Screen.Library },
        ),
        ShellDestinationSpec(
            label = "Vocabulary",
            shortLabel = "Vocab",
            icon = Icons.Outlined.Style,
            target = Screen.Vocabulary,
            matches = { it is Screen.Vocabulary },
        ),
        ShellDestinationSpec(
            label = "Grammar",
            shortLabel = "Grammar",
            icon = Icons.Outlined.AutoFixHigh,
            target = Screen.Grammar,
            matches = { it is Screen.Grammar },
        ),
        ShellDestinationSpec(
            label = "More",
            shortLabel = "More",
            icon = Icons.Outlined.MoreHoriz,
            target = Screen.More,
            matches = {
                it is Screen.More ||
                    it is Screen.Clipboard ||
                    (it is Screen.Settings && !it.showBack)
            },
        ),
    )

internal fun shellChromeFor(screen: Screen): ShellChromeSpec {
    val showBottomBar =
        when (screen) {
            Screen.Library,
            Screen.Vocabulary,
            Screen.Grammar,
            Screen.Clipboard,
            Screen.More,
            -> true

            is Screen.Settings -> !screen.showBack

            is Screen.Login,
            is Screen.Reader,
            -> false
        }

    return ShellChromeSpec(
        showBottomBar = showBottomBar,
        selectedDestination =
            if (showBottomBar) {
                shellDestinations.firstOrNull { it.matches(screen) }
            } else {
                null
            },
    )
}

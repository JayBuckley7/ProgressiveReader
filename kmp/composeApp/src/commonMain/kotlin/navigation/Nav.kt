package com.progressivereader.kmp.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember

sealed interface Screen {
    data object Login : Screen
    data object Library : Screen
    data class Reader(val bookId: String) : Screen
    data object Settings : Screen
}

class Navigator(initial: Screen) {
    private val stack = mutableStateListOf(initial)
    val current: Screen get() = stack.last()

    fun push(s: Screen) {
        stack.add(s)
    }

    fun pop() {
        if (stack.size > 1) stack.removeLast()
    }

    fun reset(s: Screen) {
        stack.clear()
        stack.add(s)
    }
}

@Composable
fun rememberNavigator(start: Screen = Screen.Library): Navigator = remember { Navigator(start) }

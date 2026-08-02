package com.progressivereader.kmp.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember

sealed interface Screen {
    data class Login(val autoStartSignIn: Boolean = false) : Screen
    data object Library : Screen
    data object Vocabulary : Screen
    data object Clipboard : Screen
    data object Grammar : Screen
    data object More : Screen
    data class Reader(val bookId: String) : Screen
    data class Settings(val showBack: Boolean = false) : Screen
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

    fun canPop(): Boolean = stack.size > 1
}

@Composable
fun rememberNavigator(start: Screen = Screen.Library): Navigator = remember { Navigator(start) }

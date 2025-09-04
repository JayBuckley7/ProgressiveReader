package com.progressivereader.kmp.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember

sealed interface Screen {
    data object Login : Screen
    data object Library : Screen
    data class Reader(val bookId: String) : Screen
    data object Settings : Screen
}

class Navigator(initial: Screen) {
    private val _stack = mutableListOf(initial)
    val current: Screen get() = _stack.last()
    fun push(s: Screen) { _stack.add(s) }
    fun pop() { if (_stack.size > 1) _stack.removeLast() }
    fun reset(s: Screen) { _stack.clear(); _stack.add(s) }
}

@Composable
fun rememberNavigator(start: Screen = Screen.Login): Navigator {
    val state = remember { mutableStateOf(Navigator(start)) }
    return state.value
}



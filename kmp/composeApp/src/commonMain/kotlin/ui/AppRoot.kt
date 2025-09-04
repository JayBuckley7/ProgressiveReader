package com.progressivereader.kmp.ui

import androidx.compose.runtime.Composable
import com.progressivereader.kmp.navigation.Navigator
import com.progressivereader.kmp.navigation.Screen

@Composable
fun AppRoot(navigator: Navigator, sessionTokenProvider: () -> String?, onRequireLogin: () -> Unit) {
    when (val s = navigator.current) {
        Screen.Login -> LoginScreen(onLoggedIn = { navigator.reset(Screen.Library) }, sessionTokenProvider)
        Screen.Library -> LibraryScreen(
            onOpenReader = { bookId -> navigator.push(Screen.Reader(bookId)) },
            onOpenSettings = { navigator.push(Screen.Settings) },
            sessionTokenProvider = sessionTokenProvider,
            onRequireLogin = onRequireLogin
        )
        is Screen.Reader -> ReaderScreen(bookId = s.bookId, sessionTokenProvider = sessionTokenProvider)
        Screen.Settings -> SettingsScreen(sessionTokenProvider = sessionTokenProvider)
    }
}



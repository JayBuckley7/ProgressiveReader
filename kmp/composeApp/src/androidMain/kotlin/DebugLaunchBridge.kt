package com.progressivereader.kmp

import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.progressivereader.kmp.navigation.Screen
import java.util.concurrent.atomic.AtomicLong

internal data class DebugLaunchRequest(
    val id: Long,
    val startScreen: Screen,
)

internal object DebugLaunchBridge {
    private val ids = AtomicLong(0L)

    const val EXTRA_ROUTE = "pr.debug.route"
    const val EXTRA_AUTO_SIGN_IN = "pr.debug.auto_sign_in"
    const val EXTRA_BOOK_ID = "pr.debug.book_id"

    var pendingRequest: DebugLaunchRequest? by mutableStateOf(null)
        private set

    fun updateFromIntent(intent: Intent?) {
        val startScreen = parseStartScreen(intent) ?: return
        pendingRequest =
            DebugLaunchRequest(
                id = ids.incrementAndGet(),
                startScreen = startScreen,
            )
    }

    fun consume(id: Long) {
        if (pendingRequest?.id == id) {
            pendingRequest = null
        }
    }

    private fun parseStartScreen(intent: Intent?): Screen? {
        if (intent == null) return null

        return when (intent.getStringExtra(EXTRA_ROUTE)?.trim()?.lowercase()) {
            "login" -> Screen.Login(autoStartSignIn = intent.getBooleanExtra(EXTRA_AUTO_SIGN_IN, false))
            "library" -> Screen.Library
            "clipboard" -> Screen.Clipboard
            "more" -> Screen.More
            "settings" -> Screen.Settings(showBack = false)
            "reader" ->
                intent.getStringExtra(EXTRA_BOOK_ID)
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                    ?.let(Screen::Reader)
            else -> null
        }
    }
}

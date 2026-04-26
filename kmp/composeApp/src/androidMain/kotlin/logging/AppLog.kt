package com.progressivereader.kmp.logging

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

object AppLog {
    private const val MaxEntries = 800
    private const val LogFileName = "app-debug.log"

    private val loggerScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val writeMutex = Mutex()
    private val _entries = MutableStateFlow<List<String>>(emptyList())

    private var installed = false
    private var crashHandlerInstalled = false
    private var logFile: File? = null

    val entries: StateFlow<List<String>> = _entries.asStateFlow()

    fun install(context: Context) {
        if (installed) return
        synchronized(this) {
            if (installed) return
            val file = File(context.filesDir, LogFileName)
            logFile = file
            val existing =
                runCatching { file.readLines(Charsets.UTF_8) }
                    .getOrDefault(emptyList())
                    .takeLast(MaxEntries)
            _entries.value = existing
            installed = true
            installCrashHandler()
            i("AppLog", "Installed app logger.")
        }
    }

    fun clear() {
        _entries.value = emptyList()
        loggerScope.launch {
            writeMutex.withLock {
                runCatching { logFile?.writeText("", Charsets.UTF_8) }
            }
        }
    }

    fun d(tag: String, message: String) {
        Log.d(tag, message)
        append("D", tag, message)
    }

    fun i(tag: String, message: String) {
        Log.i(tag, message)
        append("I", tag, message)
    }

    fun w(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable == null) Log.w(tag, message) else Log.w(tag, message, throwable)
        append("W", tag, message, throwable)
    }

    fun e(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable == null) Log.e(tag, message) else Log.e(tag, message, throwable)
        append("E", tag, message, throwable)
    }

    private fun append(
        level: String,
        tag: String,
        message: String,
        throwable: Throwable? = null,
    ) {
        val timestamp = SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(Date())
        val suffix =
            throwable?.let {
                " | ${it::class.java.simpleName}: ${it.message.orEmpty()}".trimEnd()
            }.orEmpty()
        val line = "$timestamp [$level/$tag] $message$suffix"
        _entries.value = (_entries.value + line).takeLast(MaxEntries)

        loggerScope.launch {
            writeMutex.withLock {
                runCatching {
                    val file = logFile ?: return@runCatching
                    file.parentFile?.mkdirs()
                    file.appendText(line + System.lineSeparator(), Charsets.UTF_8)
                }
            }
        }
    }

    private fun installCrashHandler() {
        if (crashHandlerInstalled) return
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching {
                e(
                    tag = "Crash",
                    message = "Uncaught exception on thread ${thread.name}",
                    throwable = throwable,
                )
            }
            previous?.uncaughtException(thread, throwable)
        }
        crashHandlerInstalled = true
    }
}

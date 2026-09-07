package com.progressivereader.kmp.core

import android.util.AtomicFile
import java.io.File
import java.io.FileOutputStream

/**
 * Disk writes must be resilient to:
 * - concurrent readers
 * - process death / crash mid-write
 *
 * AtomicFile gives us "old or new" semantics via a .bak file.
 */
internal fun atomicWriteUtf8(target: File, content: String) {
    runCatching { atomicWriteUtf8WithAtomicFile(target, content) }
        .onSuccess { return }
        .onFailure { failure ->
            if (!failure.isAndroidStubFailure()) {
                throw failure
            }
            fallbackAtomicWriteUtf8(target, content)
            return
        }
}

private fun Throwable.isAndroidStubFailure(): Boolean {
    val message = message.orEmpty()
    return message.contains("not mocked", ignoreCase = true) ||
        this is NoClassDefFoundError
}

private fun atomicWriteUtf8WithAtomicFile(target: File, content: String) {
    val atomic = AtomicFile(target)
    var os: FileOutputStream? = null
    try {
        os = atomic.startWrite()
        os.write(content.toByteArray(Charsets.UTF_8))
        runCatching { os.fd.sync() }
        atomic.finishWrite(os)
    } catch (t: Throwable) {
        if (os != null) runCatching { atomic.failWrite(os) }
        throw t
    }
}

private fun fallbackAtomicWriteUtf8(target: File, content: String) {
    val parent = target.absoluteFile.parentFile
    parent?.mkdirs()

    val tempFile = File.createTempFile("${target.name}.", ".tmp", parent)
    try {
        tempFile.writeText(content, Charsets.UTF_8)
        if (target.exists() && !target.delete()) {
            error("Could not replace ${target.absolutePath}")
        }
        if (!tempFile.renameTo(target)) {
            tempFile.copyTo(target, overwrite = true)
        }
    } finally {
        if (tempFile.exists()) {
            runCatching { tempFile.delete() }
        }
    }
}


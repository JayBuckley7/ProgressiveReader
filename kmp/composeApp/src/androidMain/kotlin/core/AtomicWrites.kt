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


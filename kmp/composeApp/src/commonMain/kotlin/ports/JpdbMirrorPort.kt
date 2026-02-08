package com.progressivereader.kmp.ports

import com.progressivereader.kmp.jpdbMirror.JpdbMirrorSnapshot

interface JpdbMirrorPort {
    suspend fun loadSnapshot(): JpdbMirrorSnapshot?
}


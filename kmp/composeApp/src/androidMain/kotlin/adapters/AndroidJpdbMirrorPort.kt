package com.progressivereader.kmp.adapters

import android.content.Context
import com.progressivereader.kmp.jpdbMirror.JpdbMirrorSnapshot
import com.progressivereader.kmp.jpdbMirror.JpdbMirrorStore
import com.progressivereader.kmp.ports.JpdbMirrorPort

class AndroidJpdbMirrorPort(
    context: Context,
) : JpdbMirrorPort {
    private val store = JpdbMirrorStore(context.applicationContext)

    override suspend fun loadSnapshot(): JpdbMirrorSnapshot? = store.loadSnapshot()
}


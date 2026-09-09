package com.progressivereader.kmp.session

import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.progressivereader.kmp.core.atomicWriteUtf8
import java.io.File
import java.security.MessageDigest

val LocalStorageContext = staticCompositionLocalOf<Context?> { null }
val LocalStorageOwner = staticCompositionLocalOf<String?> { null }

/** Stable identity partitions local data; a rotating/expired JWT is never a storage key. */
object AccountStorage {
    private const val CLAIM = "legacy-profile-owner.txt"
    private const val GUEST = "device-guest"
    private val stores = mutableMapOf<String, DataStore<Preferences>>()

    fun needsLegacyClaim(context: Context): Boolean =
        !File(context.filesDir, CLAIM).exists() &&
            (File(context.filesDir, "books").exists() || File(context.filesDir, "datastore/app_settings.preferences_pb").exists() || File(context.filesDir, "grammar_mining").exists())

    fun claimLegacy(context: Context, ownerId: String?) {
        val claim = File(context.filesDir, CLAIM)
        check(!claim.exists()) { "Local data has already been assigned." }
        atomicWriteUtf8(claim, ownerId ?: GUEST)
    }

    internal fun rootFor(base: File, ownerId: String?, legacyOwner: String?): File {
        val owner = ownerId ?: GUEST
        if (legacyOwner == owner) return base
        val hash = MessageDigest.getInstance("SHA-256").digest(owner.toByteArray()).joinToString("") { "%02x".format(it) }
        return File(base, "profiles/$hash")
    }

    fun context(context: Context, ownerId: String?): Context {
        val base = context.applicationContext
        val claim = File(base.filesDir, CLAIM).takeIf { it.isFile }?.readText()?.trim()
        val root = rootFor(base.filesDir, ownerId, claim)
        return object : ContextWrapper(base) {
            override fun getApplicationContext(): Context = this
            override fun getFilesDir(): File = root.apply { mkdirs() }
            override fun getCacheDir(): File = File(root, "cache").apply { mkdirs() }
        }
    }

    @Synchronized
    fun preferences(context: Context, name: String): DataStore<Preferences> {
        val file = File(context.filesDir, "datastore/$name.preferences_pb")
        return stores.getOrPut(file.absolutePath) {
            PreferenceDataStoreFactory.create { file.apply { parentFile?.mkdirs() } }
        }
    }
}

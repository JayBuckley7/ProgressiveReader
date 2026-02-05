package com.progressivereader.kmp.settings

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "app_settings")

class AppSettingsStore(private val context: Context) {
    private object Keys {
        val backendBaseUrl = stringPreferencesKey("backend_base_url")
        val driveFolderId = stringPreferencesKey("drive_folder_id")
        val darkMode = booleanPreferencesKey("reader_dark_mode")
        val fontSizeSp = floatPreferencesKey("reader_font_size_sp")
    }

    val settingsFlow: Flow<AppSettings> =
        context.dataStore.data.map { prefs -> prefs.toAppSettings() }

    suspend fun setBackendBaseUrl(url: String) {
        context.dataStore.edit { it[Keys.backendBaseUrl] = url }
    }

    suspend fun setDriveFolderId(folderId: String?) {
        context.dataStore.edit {
            if (folderId.isNullOrBlank()) it.remove(Keys.driveFolderId) else it[Keys.driveFolderId] = folderId
        }
    }

    suspend fun setReaderDarkMode(enabled: Boolean) {
        context.dataStore.edit { it[Keys.darkMode] = enabled }
    }

    suspend fun setReaderFontSizeSp(fontSizeSp: Float) {
        context.dataStore.edit { it[Keys.fontSizeSp] = fontSizeSp }
    }

    private fun Preferences.toAppSettings(): AppSettings {
        val backend = this[Keys.backendBaseUrl] ?: "http://10.0.2.2:5000"
        val folderId = this[Keys.driveFolderId]
        val reader =
            ReaderSettings(
                darkMode = this[Keys.darkMode] ?: true,
                fontSizeSp = this[Keys.fontSizeSp] ?: 18f,
            )
        return AppSettings(
            backendBaseUrl = backend,
            driveFolderId = folderId,
            reader = reader,
        )
    }
}

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
        // Legacy (debug-era) key; keep for migration.
        val darkMode = booleanPreferencesKey("reader_dark_mode")
        val theme = stringPreferencesKey("reader_theme")
        val fontSizeSp = floatPreferencesKey("reader_font_size_sp")
        val ttsRate = floatPreferencesKey("reader_tts_rate")
        val openAiApiKey = stringPreferencesKey("reader_openai_api_key")
        val openAiModel = stringPreferencesKey("reader_openai_model")
        val cacheTranslations = booleanPreferencesKey("reader_cache_translations")
        val uiLanguage = stringPreferencesKey("reader_ui_language")
        val jpdbApiKey = stringPreferencesKey("reader_jpdb_api_key")
        val cefrLevel = stringPreferencesKey("reader_cefr_level")
        val jpdbHighlightEnabled = booleanPreferencesKey("reader_jpdb_highlight_enabled")
        val translationTargetLang = stringPreferencesKey("reader_translation_target_lang")
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

    suspend fun setReaderTheme(theme: String) {
        val normalized =
            when (theme.trim().lowercase()) {
                "system" -> "system"
                "light" -> "light"
                "dark" -> "dark"
                // Web-only themes; treat as dark on mobile for now.
                "wood" -> "dark"
                "space" -> "dark"
                else -> "dark"
            }
        context.dataStore.edit {
            it[Keys.theme] = normalized
            // Maintain legacy boolean for older builds and as a sensible fallback.
            it[Keys.darkMode] = normalized != "light"
        }
    }

    suspend fun setReaderFontSizeSp(fontSizeSp: Float) {
        context.dataStore.edit { it[Keys.fontSizeSp] = fontSizeSp }
    }

    suspend fun setReaderTtsRate(rate: Float) {
        context.dataStore.edit { it[Keys.ttsRate] = rate.coerceIn(0.5f, 2.0f) }
    }

    suspend fun setReaderOpenAiApiKey(apiKey: String?) {
        context.dataStore.edit {
            if (apiKey.isNullOrBlank()) it.remove(Keys.openAiApiKey) else it[Keys.openAiApiKey] = apiKey
        }
    }

    suspend fun setReaderOpenAiModel(model: String) {
        val normalized = model.trim().ifBlank { "gpt-4o-mini" }
        context.dataStore.edit { it[Keys.openAiModel] = normalized }
    }

    suspend fun setReaderCacheTranslations(enabled: Boolean) {
        context.dataStore.edit { it[Keys.cacheTranslations] = enabled }
    }

    suspend fun setReaderUiLanguage(lang: String) {
        val normalized = lang.trim().lowercase().ifBlank { "en" }
        context.dataStore.edit { it[Keys.uiLanguage] = normalized }
    }

    suspend fun setReaderJpdbApiKey(apiKey: String?) {
        context.dataStore.edit {
            if (apiKey.isNullOrBlank()) it.remove(Keys.jpdbApiKey) else it[Keys.jpdbApiKey] = apiKey
        }
    }

    suspend fun setReaderCefrLevel(level: String) {
        context.dataStore.edit { it[Keys.cefrLevel] = level.trim().ifBlank { "B1" } }
    }

    suspend fun setReaderJpdbHighlightEnabled(enabled: Boolean) {
        context.dataStore.edit { it[Keys.jpdbHighlightEnabled] = enabled }
    }

    suspend fun setReaderTranslationTargetLang(lang: String) {
        context.dataStore.edit { it[Keys.translationTargetLang] = lang.trim().ifBlank { "English" } }
    }

    private fun Preferences.toAppSettings(): AppSettings {
        val backend = this[Keys.backendBaseUrl] ?: "http://10.0.2.2:5000"
        val folderId = this[Keys.driveFolderId]
        val theme =
            this[Keys.theme]
                ?: run {
                    val legacy = this[Keys.darkMode]
                    when (legacy) {
                        true -> "dark"
                        false -> "light"
                        null -> "dark"
                    }
                }
        val reader =
            ReaderSettings(
                theme = theme,
                fontSizeSp = this[Keys.fontSizeSp] ?: 18f,
                ttsRate = this[Keys.ttsRate] ?: 1.0f,
                cefrLevel = this[Keys.cefrLevel] ?: "B1",
                openAiApiKey = this[Keys.openAiApiKey],
                openAiModel = this[Keys.openAiModel] ?: "gpt-4o-mini",
                cacheTranslations = this[Keys.cacheTranslations] ?: true,
                uiLanguage = this[Keys.uiLanguage] ?: "en",
                jpdbApiKey = this[Keys.jpdbApiKey],
                jpdbHighlightEnabled = this[Keys.jpdbHighlightEnabled] ?: false,
                translationTargetLang = this[Keys.translationTargetLang] ?: "English",
            )
        return AppSettings(
            backendBaseUrl = backend,
            driveFolderId = folderId,
            reader = reader,
        )
    }
}

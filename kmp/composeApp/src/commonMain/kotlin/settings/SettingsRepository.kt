package com.progressivereader.kmp.settings

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class SettingsRepository(private val service: SettingsService) {
    suspend fun loadReaderSettings(): ReaderSettings {
        val obj = service.getSettings() ?: return ReaderSettings()
        return ReaderSettings(
            darkMode = obj["darkMode"]?.jsonPrimitive?.booleanOrNull ?: false,
            fontSizeSp = obj["fontSizeSp"]?.jsonPrimitive?.floatOrNull ?: 18f,
            cefrLevel = obj["cefrLevel"]?.jsonPrimitive?.contentOrNull ?: "B1",
            jpdbApiKey = obj["jpdbApiKey"]?.jsonPrimitive?.contentOrNull
        )
    }

    suspend fun saveReaderSettings(s: ReaderSettings): Boolean {
        val obj = buildJsonObject {
            put("darkMode", s.darkMode)
            put("fontSizeSp", s.fontSizeSp)
            put("cefrLevel", s.cefrLevel)
            s.jpdbApiKey?.let { put("jpdbApiKey", it) }
        }
        return service.saveSettings(obj)
    }
}








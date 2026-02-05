package com.progressivereader.kmp.session

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "session")

class SessionStore(private val context: Context) {
    private object Keys {
        val jwt = stringPreferencesKey("clerk_jwt")
    }

    val jwtFlow: Flow<String?> =
        context.dataStore.data.map { prefs -> prefs[Keys.jwt]?.takeIf { it.isNotBlank() } }

    suspend fun setJwt(jwt: String?) {
        context.dataStore.edit { prefs ->
            if (jwt.isNullOrBlank()) prefs.remove(Keys.jwt) else prefs[Keys.jwt] = jwt
        }
    }
}


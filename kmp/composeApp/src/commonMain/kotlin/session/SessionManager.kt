package com.progressivereader.kmp.session

import androidx.compose.runtime.mutableStateOf

object SessionManager {
    val sessionToken = mutableStateOf<String?>(null)
    fun setToken(token: String?) { sessionToken.value = token }
    fun getToken(): String? = sessionToken.value
}



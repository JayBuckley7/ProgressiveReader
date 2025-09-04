package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.material3.OutlinedTextField
import com.progressivereader.kmp.session.SessionManager

@Composable
fun LoginScreen(onLoggedIn: () -> Unit, sessionTokenProvider: () -> String?) {
    val error = remember { mutableStateOf<String?>(null) }
    val manualToken = remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("ProgressiveReader", style = MaterialTheme.typography.titleLarge)
        Text("Please sign in using Clerk (Android/iOS native SDK integration TBD).")
        OutlinedTextField(value = manualToken.value, onValueChange = { manualToken.value = it }, label = { Text("Paste Clerk Session Token (temp)") })
        Button(onClick = {
            val token = sessionTokenProvider()
            val chosen = token ?: manualToken.value.ifBlank { null }
            if (chosen.isNullOrBlank()) error.value = "No Clerk session token available"
            else { SessionManager.setToken(chosen); onLoggedIn() }
        }) { Text("Continue") }
        TextButton(onClick = {
            // Placeholder for native SDK sign-in screen
            error.value = "Native Clerk sign-in not yet implemented"
        }) { Text("Sign in with Clerk") }
        error.value?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}



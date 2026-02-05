package com.progressivereader.kmp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.ClerkResult
import com.clerk.api.session.fetchToken
import com.clerk.api.signin.SignIn
import com.clerk.api.sso.OAuthProvider
import com.progressivereader.kmp.BuildConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onBack: () -> Unit,
    onContinueAsGuest: () -> Unit,
    onSignedIn: (jwt: String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var manualToken by remember { mutableStateOf("") }
    var signInJob by remember { mutableStateOf<Job?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sign in") },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            signInJob?.cancel()
                            signInJob = null
                            isLoading = false
                            onBack()
                        },
                    ) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Text(
                    text = "ProgressiveReader",
                    style = MaterialTheme.typography.headlineSmall,
                )
            }

            item {
                Text(
                    text = "Sign in to browse and download from Google Drive. Offline mode shows cached books only.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = true,
                            onClick = {
                                signInJob?.cancel()
                                signInJob = null
                                isLoading = false
                                onContinueAsGuest()
                            },
                        ) {
                            Icon(Icons.Outlined.AccountCircle, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Continue as Guest")
                        }

                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isLoading,
                            onClick = {
                                signInJob?.cancel()
                                signInJob =
                                    scope.launch {
                                    error = null
                                    val publishableKey = BuildConfig.CLERK_PUBLISHABLE_KEY
                                    if (publishableKey.isBlank()) {
                                        error = "Missing Clerk publishable key (CLERK_PUBLISHABLE_KEY)."
                                        return@launch
                                    }

                                    isLoading = true
                                    try {
                                        if (Clerk.isInitialized.value != true) {
                                            Clerk.initialize(
                                                context = context.applicationContext,
                                                publishableKey = publishableKey,
                                            )
                                        }

                                        val redirectUrl = "clerk://${BuildConfig.APPLICATION_ID}.oauth"
                                        val result =
                                            SignIn.authenticateWithRedirect(
                                                SignIn.AuthenticateWithRedirectParams.OAuth(
                                                    provider = OAuthProvider.GOOGLE,
                                                    redirectUrl = redirectUrl,
                                                ),
                                            )

                                        when (result) {
                                            is ClerkResult.Failure -> {
                                                error =
                                                    result.error?.errors?.firstOrNull()?.message
                                                        ?: "Sign in failed"
                                            }

                                            is ClerkResult.Success -> {
                                                val sessionId =
                                                    result.value.signIn?.createdSessionId
                                                        ?: result.value.signUp?.createdSessionId
                                                if (sessionId.isNullOrBlank()) {
                                                    error = "Sign in completed, but no session ID was returned."
                                                    return@launch
                                                }

                                                val activeResult = Clerk.setActive(sessionId)
                                                if (activeResult is ClerkResult.Failure) {
                                                    error =
                                                        activeResult.error?.errors?.firstOrNull()?.message
                                                            ?: "Failed to activate session"
                                                    return@launch
                                                }

                                                val tokenRes = Clerk.session?.fetchToken()
                                                when (tokenRes) {
                                                    is ClerkResult.Success -> onSignedIn(tokenRes.value.jwt)
                                                    is ClerkResult.Failure -> {
                                                        error =
                                                            tokenRes.error?.errors?.firstOrNull()?.message
                                                                ?: "Failed to fetch session token"
                                                    }

                                                    null -> error = "No active session token available"
                                                }
                                            }
                                        }
                                    } catch (t: Throwable) {
                                        if (t !is CancellationException) {
                                            error = t.message ?: "Sign in failed"
                                        }
                                    } finally {
                                        isLoading = false
                                        signInJob = null
                                    }
                                }
                            },
                        ) {
                            if (isLoading) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.padding(end = 10.dp),
                                )
                            } else {
                                Icon(Icons.Outlined.Login, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                            }
                            Text("Sign in with Clerk")
                        }

                        if (isLoading) {
                            TextButton(
                                onClick = {
                                    signInJob?.cancel()
                                    signInJob = null
                                    isLoading = false
                                },
                            ) { Text("Cancel") }
                        }
                    }
                }
            }

            if (BuildConfig.DEBUG) {
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text("Debug fallback", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "If native sign-in is blocked, paste a Clerk JWT.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            OutlinedTextField(
                                value = manualToken,
                                onValueChange = { manualToken = it },
                                label = { Text("Paste Clerk JWT") },
                                singleLine = true,
                                enabled = !isLoading,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            TextButton(
                                enabled = !isLoading,
                                onClick = {
                                    val trimmed = manualToken.trim()
                                    if (trimmed.isBlank()) error = "Token is empty" else onSignedIn(trimmed)
                                },
                            ) {
                                Text("Use pasted token")
                            }
                        }
                    }
                }
            }

            error?.let { msg ->
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text(
                                text = msg,
                                color = MaterialTheme.colorScheme.error,
                                textAlign = TextAlign.Start,
                            )
                        }
                    }
                }
            }
        }
    }
}

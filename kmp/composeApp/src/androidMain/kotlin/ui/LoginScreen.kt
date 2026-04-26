package com.progressivereader.kmp.ui

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.clerk.api.Clerk
import com.clerk.api.network.serialization.ClerkResult
import com.clerk.api.session.fetchToken
import com.clerk.api.signin.SignIn
import com.clerk.api.sso.OAuthProvider
import com.progressivereader.kmp.BuildConfig
import com.progressivereader.kmp.logging.AppLog
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onBack: () -> Unit,
    onContinueAsGuest: () -> Unit,
    onSignedIn: (jwt: String) -> Unit,
    autoStartSignIn: Boolean,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val isOnline = rememberIsOnline()

    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var manualToken by remember { mutableStateOf("") }
    var signInJob by remember { mutableStateOf<Job?>(null) }
    var restoreChecked by remember { mutableStateOf(false) }
    var autoStarted by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val publishableKey = BuildConfig.CLERK_PUBLISHABLE_KEY
        if (publishableKey.isBlank()) {
            AppLog.w("Auth", "Login screen opened without a Clerk publishable key.")
            restoreChecked = true
            return@LaunchedEffect
        }

        runCatching {
            if (Clerk.isInitialized.value != true) {
                Clerk.initialize(
                    context = context.applicationContext,
                    publishableKey = publishableKey,
                )
                AppLog.i("Auth", "Clerk initialized from login screen.")
            }
        }

        val tokenRes = runCatching { Clerk.session?.fetchToken() }.getOrNull()
        if (tokenRes is ClerkResult.Success) {
            AppLog.i("Auth", "Login screen restored an existing Clerk session.")
            onSignedIn(tokenRes.value.jwt)
            return@LaunchedEffect
        }
        restoreChecked = true
    }

    fun beginSignIn() {
        signInJob?.cancel()
        AppLog.i("Auth", "Starting Clerk sign-in flow.")
        signInJob =
            scope.launch {
                error = null
                val publishableKey = BuildConfig.CLERK_PUBLISHABLE_KEY
                if (publishableKey.isBlank()) {
                    AppLog.w("Auth", "Blocked sign-in because Clerk publishable key is blank.")
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

                    val existingToken = runCatching { Clerk.session?.fetchToken() }.getOrNull()
                    if (existingToken is ClerkResult.Success) {
                        AppLog.i("Auth", "Using existing Clerk session token instead of redirecting.")
                        onSignedIn(existingToken.value.jwt)
                        return@launch
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
                            val msg =
                                result.error?.errors?.firstOrNull()?.message
                                    ?: "Sign in failed"
                            AppLog.w("Auth", "Clerk redirect sign-in failed: $msg")
                            val tokenRes = runCatching { Clerk.session?.fetchToken() }.getOrNull()
                            if (tokenRes is ClerkResult.Success) {
                                AppLog.i("Auth", "Recovered Clerk token after redirect failure.")
                                onSignedIn(tokenRes.value.jwt)
                                return@launch
                            }
                            error = msg
                        }

                        is ClerkResult.Success -> {
                            val sessionId =
                                result.value.signIn?.createdSessionId
                                    ?: result.value.signUp?.createdSessionId
                            if (sessionId.isNullOrBlank()) {
                                val tokenRes = runCatching { Clerk.session?.fetchToken() }.getOrNull()
                                if (tokenRes is ClerkResult.Success) {
                                    AppLog.i("Auth", "Recovered Clerk token without a createdSessionId.")
                                    onSignedIn(tokenRes.value.jwt)
                                    return@launch
                                }

                                AppLog.w("Auth", "Sign-in completed but Clerk returned no session ID.")
                                error = "Sign in completed, but no session ID was returned."
                                return@launch
                            }

                            val activeResult = Clerk.setActive(sessionId)
                            if (activeResult is ClerkResult.Failure) {
                                AppLog.w("Auth", "Failed to activate Clerk session $sessionId.")
                                val tokenRes = runCatching { Clerk.session?.fetchToken() }.getOrNull()
                                if (tokenRes is ClerkResult.Success) {
                                    AppLog.i("Auth", "Recovered Clerk token after setActive failure.")
                                    onSignedIn(tokenRes.value.jwt)
                                    return@launch
                                }

                                error =
                                    activeResult.error?.errors?.firstOrNull()?.message
                                        ?: "Failed to activate session"
                                return@launch
                            }

                            val tokenRes = Clerk.session?.fetchToken()
                            when (tokenRes) {
                                is ClerkResult.Success -> {
                                    AppLog.i("Auth", "Clerk sign-in completed successfully.")
                                    onSignedIn(tokenRes.value.jwt)
                                }
                                is ClerkResult.Failure -> {
                                    AppLog.w("Auth", "Failed to fetch Clerk session token after sign-in.")
                                    error =
                                        tokenRes.error?.errors?.firstOrNull()?.message
                                            ?: "Failed to fetch session token"
                                }

                                null -> {
                                    AppLog.w("Auth", "Clerk sign-in completed with no active session token.")
                                    error = "No active session token available"
                                }
                            }
                        }
                    }
                } catch (t: Throwable) {
                    if (t !is CancellationException) {
                        AppLog.e("Auth", "Unexpected error during Clerk sign-in.", t)
                        error = t.message ?: "Sign in failed"
                    }
                } finally {
                    isLoading = false
                    signInJob = null
                }
            }
    }

    LaunchedEffect(autoStartSignIn, restoreChecked, isOnline) {
        if (!autoStartSignIn) return@LaunchedEffect
        if (!restoreChecked) return@LaunchedEffect
        if (autoStarted) return@LaunchedEffect

        autoStarted = true
        if (!isOnline) {
            error = "You're offline. Connect to the internet to sign in."
            return@LaunchedEffect
        }

        beginSignIn()
    }

    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                colors =
                    TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
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
        val heroBrush =
            Brush.verticalGradient(
                colors =
                    listOf(
                        MaterialTheme.colorScheme.background,
                        MaterialTheme.colorScheme.surfaceVariant,
                    ),
            )

        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(heroBrush)
                    .padding(padding),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .widthIn(max = 460.dp)
                        .align(Alignment.TopCenter)
                        .padding(horizontal = 20.dp, vertical = 18.dp)
                        .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppIconTile(icon = Icons.Outlined.MenuBook, contentDescription = null)
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            text = "Progressive Reader",
                            style = MaterialTheme.typography.titleLarge,
                        )
                        Text(
                            text = "Your Digital Bookshelf, Reimagined.",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        AppMutedText(
                            text =
                                "Sign in to browse Drive, download EPUBs for offline reading, and pick up where you left off.",
                        )
                        AppMutedText("Offline Reading • Bookmarks • Progress")
                    }
                }

                Spacer(modifier = Modifier.size(2.dp))

                AppCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(18.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            text = "Sign in to access your library",
                            style = MaterialTheme.typography.titleMedium,
                            textAlign = TextAlign.Center,
                        )
                        AppMutedText("Sign in to view and manage your books.")

                        AppPrimaryButton(
                            text =
                                when {
                                    !isOnline -> "Offline"
                                    isLoading -> "Signing in…"
                                    else -> "Sign in with Clerk"
                                },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = isOnline && !isLoading,
                            onClick = { beginSignIn() },
                            icon = {
                                if (isLoading) {
                                    CircularProgressIndicator(
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.size(18.dp),
                                    )
                                } else {
                                    Icon(Icons.Outlined.Login, contentDescription = null)
                                }
                            },
                        )

                        AppTonalButton(
                            text = "Continue as Guest",
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isLoading,
                            onClick = {
                                signInJob?.cancel()
                                signInJob = null
                                isLoading = false
                                onContinueAsGuest()
                            },
                            icon = { Icon(Icons.Outlined.AccountCircle, contentDescription = null) },
                        )

                        if (!isOnline) {
                            AppMutedText("You're offline. Connect to the internet to sign in.")
                        }

                        if (isLoading) {
                            AppTextButton(
                                text = "Cancel sign-in",
                                onClick = {
                                    signInJob?.cancel()
                                    signInJob = null
                                    isLoading = false
                                },
                            )
                        }
                    }
                }

                if (BuildConfig.DEBUG) {
                    AppCard(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Text("Debug fallback", style = MaterialTheme.typography.titleMedium)
                            AppMutedText("If native sign-in is blocked, paste a Clerk JWT.")
                            OutlinedTextField(
                                value = manualToken,
                                onValueChange = { manualToken = it },
                                label = { Text("Paste Clerk JWT") },
                                singleLine = true,
                                enabled = !isLoading,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            AppTextButton(
                                text = "Use pasted token",
                                enabled = !isLoading,
                                onClick = {
                                    val trimmed = manualToken.trim()
                                    if (trimmed.isBlank()) error = "Token is empty" else onSignedIn(trimmed)
                                },
                            )
                        }
                    }
                }

                error?.let { msg ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = MaterialTheme.shapes.medium,
                        color = MaterialTheme.colorScheme.errorContainer,
                    ) {
                        Text(
                            text = msg,
                            modifier = Modifier.padding(14.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            textAlign = TextAlign.Start,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

package com.progressivereader.kmp.ui

import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

@Composable
fun rememberIsOnline(): Boolean {
    val context = LocalContext.current
    val cm = remember { context.getSystemService(ConnectivityManager::class.java) }

    fun isOnlineNow(): Boolean {
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    val state = remember { mutableStateOf(isOnlineNow()) }

    DisposableEffect(cm) {
        val cb =
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    state.value = isOnlineNow()
                }

                override fun onLost(network: Network) {
                    state.value = isOnlineNow()
                }

                override fun onCapabilitiesChanged(
                    network: Network,
                    networkCapabilities: NetworkCapabilities,
                ) {
                    state.value = isOnlineNow()
                }
            }

        cm.registerDefaultNetworkCallback(cb)
        onDispose { runCatching { cm.unregisterNetworkCallback(cb) } }
    }

    return state.value
}


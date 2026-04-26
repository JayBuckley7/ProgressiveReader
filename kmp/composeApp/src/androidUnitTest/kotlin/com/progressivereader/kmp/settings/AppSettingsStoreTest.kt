package com.progressivereader.kmp.settings

import kotlin.test.assertEquals
import org.junit.Test

class AppSettingsStoreTest {
    @Test
    fun `defaults to hosted backend when unset`() {
        assertEquals(
            AppSettingsStore.HostedBackendBaseUrl,
            AppSettingsStore.normalizeBackendBaseUrl(storedValue = null, debugMode = false),
        )
    }

    @Test
    fun `migrates legacy local backend to hosted when debug mode is off`() {
        assertEquals(
            AppSettingsStore.HostedBackendBaseUrl,
            AppSettingsStore.normalizeBackendBaseUrl(
                storedValue = AppSettingsStore.LegacyLocalBackendBaseUrl,
                debugMode = false,
            ),
        )
    }

    @Test
    fun `preserves explicit local backend when debug mode is on`() {
        assertEquals(
            AppSettingsStore.LegacyLocalBackendBaseUrl,
            AppSettingsStore.normalizeBackendBaseUrl(
                storedValue = AppSettingsStore.LegacyLocalBackendBaseUrl,
                debugMode = true,
            ),
        )
    }

    @Test
    fun `preserves explicit hosted backend`() {
        assertEquals(
            AppSettingsStore.HostedBackendBaseUrl,
            AppSettingsStore.normalizeBackendBaseUrl(
                storedValue = AppSettingsStore.HostedBackendBaseUrl,
                debugMode = false,
            ),
        )
    }
}

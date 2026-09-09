package com.progressivereader.kmp.ui

import android.content.Context
import android.content.ContextWrapper
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.test.platform.app.InstrumentationRegistry
import com.progressivereader.kmp.offline.BookCache
import com.progressivereader.kmp.settings.AppSettings
import java.io.File
import java.util.UUID
import org.junit.Rule
import org.junit.Test

class PdfReaderFailureTest {
    @get:Rule val rule = createComposeRule()

    @Test fun corruptPdfShowsRecoverableErrorInsteadOfCrashing() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val dir = File(app.cacheDir, "pdf-test-${UUID.randomUUID()}").apply { mkdirs() }
        val context = object : ContextWrapper(app) {
            override fun getFilesDir(): File = dir
            override fun getApplicationContext(): Context = this
        }
        val cache = BookCache(context)
        cache.pdfFile("fixture").apply { parentFile!!.mkdirs(); writeText("This is not a valid PDF") }
        rule.setContent {
            ProgressiveReaderTheme("dark") {
                PdfReaderScreen("fixture", "Invalid PDF fixture", AppSettings(), cache, {}, {}, {})
            }
        }
        rule.onNodeWithText("This PDF could not be opened", substring = true).assertIsDisplayed()
    }
}

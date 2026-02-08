package com.progressivereader.kmp.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.progressivereader.kmp.domain.reader.BookFormat
import com.progressivereader.kmp.ui.viewmodels.ReaderUiState

@Composable
fun ReaderHostScreen(
    state: ReaderUiState,
    onBack: () -> Unit,
    pdfContent: @Composable () -> Unit,
    txtContent: @Composable () -> Unit,
    epubContent: @Composable () -> Unit,
) {
    // Ensure Android system back exits the reader to the library (or previous screen) instead of closing the app.
    BackHandler(onBack = onBack)

    when {
        state.openError != null -> {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(state.openError, color = MaterialTheme.colorScheme.error)
                AppOutlineButton(text = "Back", onClick = onBack)
            }
        }

        state.isOpening || state.format == null -> {
            Column(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CircularProgressIndicator()
            }
        }

        state.format == BookFormat.PDF -> pdfContent()
        state.format == BookFormat.TXT -> txtContent()
        state.format == BookFormat.EPUB -> epubContent()
    }
}

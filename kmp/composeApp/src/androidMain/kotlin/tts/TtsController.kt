package com.progressivereader.kmp.tts

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class TtsController(context: Context) {
    private val appContext = context.applicationContext

    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady

    private val _isSpeaking = MutableStateFlow(false)
    val isSpeaking: StateFlow<Boolean> = _isSpeaking

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError

    private var tts: TextToSpeech? = null
    private var lastUtteranceId: String? = null

    init {
        tts =
            TextToSpeech(appContext) { status ->
                val ok = status == TextToSpeech.SUCCESS
                _isReady.value = ok
                if (!ok) _lastError.value = "TTS initialization failed"
            }.apply {
                setOnUtteranceProgressListener(
                    object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {
                            _isSpeaking.value = true
                        }

                        override fun onDone(utteranceId: String?) {
                            if (utteranceId != null && utteranceId == lastUtteranceId) {
                                _isSpeaking.value = false
                            }
                        }

                        @Deprecated("Deprecated in Java")
                        override fun onError(utteranceId: String?) {
                            _isSpeaking.value = false
                            _lastError.value = "TTS error"
                        }

                        override fun onError(utteranceId: String?, errorCode: Int) {
                            _isSpeaking.value = false
                            _lastError.value = "TTS error ($errorCode)"
                        }
                    }
                )
            }
    }

    fun setRate(rate: Float) {
        tts?.setSpeechRate(rate.coerceIn(0.5f, 2.0f))
    }

    fun speak(text: String) {
        val engine = tts ?: return
        val cleaned = text.trim()
        if (cleaned.isBlank()) return

        _lastError.value = null
        _isSpeaking.value = true

        val chunks = chunkText(cleaned, maxChars = 2000)
        val baseId = UUID.randomUUID().toString()
        lastUtteranceId = "$baseId-${chunks.size - 1}"

        chunks.forEachIndexed { idx, chunk ->
            val mode = if (idx == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
            engine.speak(chunk, mode, null, "$baseId-$idx")
        }
    }

    fun stop() {
        lastUtteranceId = null
        runCatching { tts?.stop() }
        _isSpeaking.value = false
    }

    fun shutdown() {
        lastUtteranceId = null
        runCatching { tts?.stop() }
        runCatching { tts?.shutdown() }
        tts = null
        _isReady.value = false
        _isSpeaking.value = false
    }

    private fun chunkText(text: String, maxChars: Int): List<String> {
        if (text.length <= maxChars) return listOf(text)

        val chunks = mutableListOf<String>()
        var start = 0
        while (start < text.length) {
            val end = minOf(text.length, start + maxChars)
            chunks.add(text.substring(start, end))
            start = end
        }
        return chunks
    }
}


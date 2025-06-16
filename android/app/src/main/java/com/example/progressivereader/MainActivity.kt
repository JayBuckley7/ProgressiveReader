package com.example.progressivereader

import android.os.Bundle
import android.webkit.WebView
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.progressivereader.network.ChatCompletionRequest
import com.example.progressivereader.network.ChatMessage
import com.example.progressivereader.network.OpenAiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val apiKeyField = findViewById<EditText>(R.id.et_api_key)
        val targetLangField = findViewById<EditText>(R.id.et_target_lang)
        val htmlInputField = findViewById<EditText>(R.id.et_html_input)
        val button = findViewById<Button>(R.id.btn_translate)
        val webView = findViewById<WebView>(R.id.webview_result)

        button.setOnClickListener {
            val apiKey = apiKeyField.text.toString().trim()
            val targetLang = targetLangField.text.toString().trim()
            val htmlContent = htmlInputField.text.toString().trim()
            if (apiKey.isEmpty() || targetLang.isEmpty() || htmlContent.isEmpty()) {
                return@setOnClickListener
            }
            lifecycleScope.launch {
                val service = OpenAiService.create(apiKey)
                val systemPrompt = "You are a helpful translator. You translate the provided HTML content while preserving the HTML structure. ONLY return the translated HTML content, with no introductory text, explanations, or markdown formatting like ```html."
                val userPrompt = "Translate the following HTML content to $targetLang. Preserve HTML tags.\n\nHTML Content:\n```html\n$htmlContent\n```"
                val request = ChatCompletionRequest(
                    model = "gpt-4-turbo",
                    messages = listOf(
                        ChatMessage("system", systemPrompt),
                        ChatMessage("user", userPrompt)
                    )
                )
                try {
                    val response = withContext(Dispatchers.IO) {
                        service.chatCompletion(request)
                    }
                    val translated = response.choices.firstOrNull()?.message?.content?.trim().orEmpty()
                    val cleaned = translated
                        .removePrefix("```html").removePrefix("```")
                        .removeSuffix("```")
                    webView.loadDataWithBaseURL(null, cleaned, "text/html", "utf-8", null)
                } catch (e: Exception) {
                    webView.loadData(
                        "<html><body>Error: ${e.localizedMessage}</body></html>",
                        "text/html",
                        "utf-8"
                    )
                }
            }
        }
    }
}

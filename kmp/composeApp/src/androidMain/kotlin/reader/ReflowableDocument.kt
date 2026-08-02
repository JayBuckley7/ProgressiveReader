package com.progressivereader.kmp.reader

import java.nio.charset.Charset

data class ReflowableChapterContent(
    val href: String,
    val title: String,
    val headHtml: String = "",
    val bodyHtml: String,
    val baseUrl: String? = null,
)

data class ReflowableDocument(
    val title: String,
    val chapters: List<ReflowableChapterContent>,
)

internal object PlainTextDocumentParser {
    private const val MaxChapterChars = 24_000

    fun parse(
        bytes: ByteArray,
        title: String,
    ): ReflowableDocument {
        val text = decode(bytes).replace("\u0000", "")
        val chunks = chunkText(text)
        val chapters =
            chunks.mapIndexed { index, chunk ->
                ReflowableChapterContent(
                    href = "txt:$index",
                    title = if (chunks.size == 1) title else "Part ${index + 1}",
                    bodyHtml = "<pre style=\"white-space: pre-wrap; margin: 0;\">${escapeHtml(chunk)}</pre>",
                )
            }
        return ReflowableDocument(title = title, chapters = chapters)
    }

    private fun decode(bytes: ByteArray): String {
        if (bytes.size >= 3 &&
            bytes[0] == 0xEF.toByte() &&
            bytes[1] == 0xBB.toByte() &&
            bytes[2] == 0xBF.toByte()
        ) {
            return String(bytes, 3, bytes.size - 3, Charsets.UTF_8)
        }
        if (bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte()) {
            return String(bytes, 2, bytes.size - 2, Charsets.UTF_16LE)
        }
        if (bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte()) {
            return String(bytes, 2, bytes.size - 2, Charsets.UTF_16BE)
        }

        val utf8 = String(bytes, Charsets.UTF_8)
        if (replacementRatio(utf8) <= 0.01f) return utf8

        val shiftJis = runCatching { String(bytes, Charset.forName("windows-31j")) }.getOrNull()
        return if (shiftJis != null && replacementRatio(shiftJis) < replacementRatio(utf8)) shiftJis else utf8
    }

    private fun chunkText(text: String): List<String> {
        if (text.length <= MaxChapterChars) return listOf(text)

        val chunks = mutableListOf<String>()
        val current = StringBuilder()
        text.lineSequence().forEach { line ->
            val required = line.length + if (current.isEmpty()) 0 else 1
            if (current.isNotEmpty() && current.length + required > MaxChapterChars) {
                chunks += current.toString()
                current.clear()
            }

            if (line.length > MaxChapterChars) {
                if (current.isNotEmpty()) {
                    chunks += current.toString()
                    current.clear()
                }
                var start = 0
                while (start < line.length) {
                    val end = (start + MaxChapterChars).coerceAtMost(line.length)
                    chunks += line.substring(start, end)
                    start = end
                }
            } else {
                if (current.isNotEmpty()) current.append('\n')
                current.append(line)
            }
        }
        if (current.isNotEmpty()) chunks += current.toString()
        return chunks.ifEmpty { listOf("") }
    }

    private fun escapeHtml(value: String): String =
        value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")

    private fun replacementRatio(value: String): Float {
        if (value.isEmpty()) return 0f
        return value.count { it == '\uFFFD' }.toFloat() / value.length.toFloat()
    }
}

package com.progressivereader.kmp.reader

import java.nio.charset.Charset
import org.jsoup.Jsoup

internal object MobiDocumentParser {
    private const val PalmDocHeaderSize = 16
    private const val MobiHeaderMinSize = 24
    private const val MaxChapterChars = 24_000

    fun parse(
        bytes: ByteArray,
        fallbackTitle: String,
    ): ReflowableDocument {
        require(bytes.size >= 86) { "MOBI file is too small." }

        val recordCount = bytes.u16(76)
        require(recordCount >= 2) { "MOBI file has no text records." }
        require(78 + recordCount * 8 <= bytes.size) { "MOBI record table is truncated." }

        val recordOffsets =
            (0 until recordCount).map { index ->
                bytes.u32(78 + index * 8).toInt()
            } + bytes.size
        require(recordOffsets.zipWithNext().all { (start, end) -> start in 0 until end && end <= bytes.size }) {
            "MOBI record offsets are invalid."
        }

        val recordZero = bytes.copyOfRange(recordOffsets[0], recordOffsets[1])
        require(recordZero.size >= PalmDocHeaderSize + MobiHeaderMinSize) { "MOBI header is truncated." }
        require(recordZero.ascii(PalmDocHeaderSize, 4) == "MOBI") { "Not a supported MOBI file." }

        val compression = recordZero.u16(0)
        val textLength = recordZero.u32(4).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        val textRecordCount = recordZero.u16(8).coerceAtMost(recordCount - 1)
        val encryption = recordZero.u16(12)
        require(encryption == 0) { "Encrypted MOBI books are not supported." }

        val mobiHeaderLength = recordZero.u32(PalmDocHeaderSize + 4).toInt()
        val encoding = recordZero.u32(PalmDocHeaderSize + 12).toInt()
        val extraDataFlags =
            if (mobiHeaderLength >= 0xF4 && PalmDocHeaderSize + 0xF4 <= recordZero.size) {
                recordZero.u16(PalmDocHeaderSize + 0xF2)
            } else {
                0
            }

        val decompressed = ArrayList<Byte>(textLength.coerceAtMost(2_000_000))
        for (index in 1..textRecordCount) {
            val raw = bytes.copyOfRange(recordOffsets[index], recordOffsets[index + 1])
            val payload = stripTrailingData(raw, extraDataFlags)
            val decoded =
                when (compression) {
                    1 -> payload
                    2 -> decompressPalmDoc(payload)
                    17_480 -> throw IllegalArgumentException("HUFF/CDIC-compressed MOBI books are not supported.")
                    else -> throw IllegalArgumentException("Unsupported MOBI compression type $compression.")
                }
            decoded.forEach { decompressed += it }
            if (decompressed.size >= textLength) break
        }

        val contentBytes = decompressed.take(textLength.coerceAtMost(decompressed.size)).toByteArray()
        val html = decodeText(contentBytes, encoding).replace("\u0000", "")
        require(html.isNotBlank()) { "MOBI book contains no readable text." }

        val title = readTitle(recordZero, encoding)?.takeIf { it.isNotBlank() } ?: fallbackTitle
        val chapters = buildChapters(html, title)
        require(chapters.isNotEmpty()) { "MOBI book contains no readable chapters." }
        return ReflowableDocument(title = title, chapters = chapters)
    }

    private fun readTitle(
        recordZero: ByteArray,
        encoding: Int,
    ): String? {
        val offsetPosition = PalmDocHeaderSize + 68
        val lengthPosition = PalmDocHeaderSize + 72
        if (lengthPosition + 4 > recordZero.size) return null
        val titleOffset = recordZero.u32(offsetPosition).toInt()
        val titleLength = recordZero.u32(lengthPosition).toInt()
        if (titleOffset < 0 || titleLength <= 0 || titleOffset + titleLength > recordZero.size) return null
        return decodeText(recordZero.copyOfRange(titleOffset, titleOffset + titleLength), encoding).trim()
    }

    private fun buildChapters(
        rawHtml: String,
        bookTitle: String,
    ): List<ReflowableChapterContent> {
        val pageBreak = Regex("(?i)<(?:mbp:)?pagebreak\\b[^>]*?/?>")
        val sections = rawHtml.split(pageBreak).filter { it.isNotBlank() }
        val bodies = mutableListOf<Pair<String?, String>>()

        for (section in sections.ifEmpty { listOf(rawHtml) }) {
            val doc = Jsoup.parse(section).apply { outputSettings().prettyPrint(false) }
            doc.select("script, iframe, object, embed, form").remove()
            doc.select("img[src^=http], img[src^=https]").remove()
            val body = doc.body()
            val elements = body.children()

            if (elements.isEmpty()) {
                val plain = body.text().ifBlank { section }
                PlainTextDocumentParser.parse(plain.toByteArray(Charsets.UTF_8), bookTitle).chapters.forEach {
                    bodies += null to it.bodyHtml
                }
                continue
            }

            var currentTitle: String? = null
            val current = StringBuilder()
            var currentChars = 0

            fun flush() {
                if (current.isEmpty()) return
                bodies += currentTitle to current.toString()
                current.clear()
                currentChars = 0
                currentTitle = null
            }

            for (element in elements) {
                val textLength = element.text().length
                if (current.isNotEmpty() && currentChars + textLength > MaxChapterChars) flush()
                if (currentTitle == null && element.tagName().matches(Regex("h[1-3]", RegexOption.IGNORE_CASE))) {
                    currentTitle = element.text().trim().takeIf { it.isNotBlank() }
                }
                current.append(element.outerHtml())
                currentChars += textLength
            }
            flush()
        }

        return bodies.mapIndexed { index, (heading, body) ->
            ReflowableChapterContent(
                href = "mobi:$index",
                title = heading ?: if (bodies.size == 1) bookTitle else "Part ${index + 1}",
                bodyHtml = body,
            )
        }
    }

    private fun stripTrailingData(
        record: ByteArray,
        extraDataFlags: Int,
    ): ByteArray {
        if (record.isEmpty() || extraDataFlags == 0) return record
        var end = record.size
        var flags = extraDataFlags ushr 1
        while (flags != 0 && end > 0) {
            if ((flags and 1) != 0) {
                val trailingSize = trailingEntrySize(record, end)
                if (trailingSize <= 0 || trailingSize > end) break
                end -= trailingSize
            }
            flags = flags ushr 1
        }
        if ((extraDataFlags and 1) != 0 && end > 0) {
            end = (end - ((record[end - 1].toInt() and 0x03) + 1)).coerceAtLeast(0)
        }
        return record.copyOfRange(0, end)
    }

    private fun trailingEntrySize(
        record: ByteArray,
        end: Int,
    ): Int {
        var result = 0
        for (index in 0 until 4) {
            val position = end - index - 1
            if (position < 0) return 0
            val value = record[position].toInt() and 0xFF
            result = result or ((value and 0x7F) shl (index * 7))
            if ((value and 0x80) != 0) return result
        }
        return result
    }

    internal fun decompressPalmDoc(input: ByteArray): ByteArray {
        val output = ArrayList<Byte>(input.size * 2)
        var index = 0
        while (index < input.size) {
            val value = input[index].toInt() and 0xFF
            index += 1
            when {
                value in 1..8 -> {
                    val count = value.coerceAtMost(input.size - index)
                    repeat(count) { output += input[index + it] }
                    index += count
                }
                value <= 0x7F -> output += value.toByte()
                value >= 0xC0 -> {
                    output += 0x20.toByte()
                    output += (value xor 0x80).toByte()
                }
                else -> {
                    require(index < input.size) { "PalmDOC back-reference is truncated." }
                    val pair = (value shl 8) or (input[index].toInt() and 0xFF)
                    index += 1
                    val distance = (pair shr 3) and 0x07FF
                    val count = (pair and 0x07) + 3
                    require(distance in 1..output.size) { "PalmDOC back-reference is invalid." }
                    repeat(count) { output += output[output.size - distance] }
                }
            }
        }
        return output.toByteArray()
    }

    private fun decodeText(
        bytes: ByteArray,
        encoding: Int,
    ): String =
        when (encoding) {
            65001 -> String(bytes, Charsets.UTF_8)
            1252 -> String(bytes, Charset.forName("windows-1252"))
            else -> String(bytes, Charsets.UTF_8)
        }

    private fun ByteArray.u16(offset: Int): Int {
        require(offset >= 0 && offset + 2 <= size) { "MOBI field is truncated." }
        return ((this[offset].toInt() and 0xFF) shl 8) or (this[offset + 1].toInt() and 0xFF)
    }

    private fun ByteArray.u32(offset: Int): Long {
        require(offset >= 0 && offset + 4 <= size) { "MOBI field is truncated." }
        return ((this[offset].toLong() and 0xFF) shl 24) or
            ((this[offset + 1].toLong() and 0xFF) shl 16) or
            ((this[offset + 2].toLong() and 0xFF) shl 8) or
            (this[offset + 3].toLong() and 0xFF)
    }

    private fun ByteArray.ascii(
        offset: Int,
        length: Int,
    ): String = String(this, offset, length, Charsets.US_ASCII)
}

package com.progressivereader.kmp.reader

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ReflowableDocumentParserTest {
    @Test
    fun plainTextBecomesEscapedHighlightableChapters() {
        val text = "吾輩は猫である。<&>\n" + "あ".repeat(25_000)

        val document = PlainTextDocumentParser.parse(text.toByteArray(), "猫")

        assertTrue(document.chapters.size >= 2)
        assertEquals("txt:0", document.chapters.first().href)
        assertTrue(document.chapters.first().bodyHtml.contains("吾輩は猫である。&lt;&amp;&gt;"))
    }

    @Test
    fun palmDocDecompressionSupportsLiteralRunsAndBackReferences() {
        val compressed = byteArrayOf(3, 'a'.code.toByte(), 'b'.code.toByte(), 'c'.code.toByte(), 0x80.toByte(), 0x18)

        val decoded = MobiDocumentParser.decompressPalmDoc(compressed)

        assertEquals("abcabc", String(decoded, Charsets.US_ASCII))
    }

    @Test
    fun uncompressedMobiBecomesHtmlChapters() {
        val html = "<h1>第一章</h1><p>吾輩は猫である。</p><mbp:pagebreak/><h1>第二章</h1><p>名前はまだ無い。</p>"
        val bytes = buildUncompressedMobi(title = "猫の本", html = html)

        val document = MobiDocumentParser.parse(bytes, fallbackTitle = "fallback.mobi")

        assertEquals("猫の本", document.title)
        assertEquals(2, document.chapters.size)
        assertEquals("第一章", document.chapters[0].title)
        assertEquals("mobi:1", document.chapters[1].href)
        assertTrue(document.chapters[1].bodyHtml.contains("名前はまだ無い。"))
    }

    private fun buildUncompressedMobi(
        title: String,
        html: String,
    ): ByteArray {
        val titleBytes = title.toByteArray(Charsets.UTF_8)
        val htmlBytes = html.toByteArray(Charsets.UTF_8)
        val mobiHeaderLength = 0xE4
        val titleOffset = 16 + mobiHeaderLength
        val recordZero = ByteArray(titleOffset + titleBytes.size)
        recordZero.putU16(0, 1)
        recordZero.putU32(4, htmlBytes.size)
        recordZero.putU16(8, 1)
        recordZero.putU16(10, 4096)
        recordZero.putU16(12, 0)
        "MOBI".toByteArray(Charsets.US_ASCII).copyInto(recordZero, 16)
        recordZero.putU32(20, mobiHeaderLength)
        recordZero.putU32(28, 65_001)
        recordZero.putU32(84, titleOffset)
        recordZero.putU32(88, titleBytes.size)
        titleBytes.copyInto(recordZero, titleOffset)

        val pdbHeaderSize = 78 + 2 * 8
        val recordZeroOffset = pdbHeaderSize
        val recordOneOffset = recordZeroOffset + recordZero.size
        return ByteArray(recordOneOffset + htmlBytes.size).also { mobi ->
            mobi.putU16(76, 2)
            mobi.putU32(78, recordZeroOffset)
            mobi.putU32(86, recordOneOffset)
            recordZero.copyInto(mobi, recordZeroOffset)
            htmlBytes.copyInto(mobi, recordOneOffset)
        }
    }

    private fun ByteArray.putU16(
        offset: Int,
        value: Int,
    ) {
        this[offset] = (value ushr 8).toByte()
        this[offset + 1] = value.toByte()
    }

    private fun ByteArray.putU32(
        offset: Int,
        value: Int,
    ) {
        this[offset] = (value ushr 24).toByte()
        this[offset + 1] = (value ushr 16).toByte()
        this[offset + 2] = (value ushr 8).toByte()
        this[offset + 3] = value.toByte()
    }
}

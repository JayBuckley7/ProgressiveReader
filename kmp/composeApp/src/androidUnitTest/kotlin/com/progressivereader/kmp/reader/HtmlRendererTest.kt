package com.progressivereader.kmp.reader

import kotlin.test.assertContains
import kotlin.test.assertEquals
import org.junit.Test

class HtmlRendererTest {
    @Test
    fun readerRemovesBookColorsAndScriptsWhilePreservingVocabularyLinks() {
        val html = ReaderHtmlSanitizer.body("""<p style="color: black !important; background-color: white; text-indent: 1em" onclick="alert(1)"><a class="jpdb-word known" href="pr://jpdb?tid=1">語</a></p>""")
        kotlin.test.assertFalse(html.contains("black"))
        kotlin.test.assertFalse(html.contains("white"))
        kotlin.test.assertFalse(html.contains("onclick"))
        assertContains(html, "text-indent")
        assertContains(html, "pr://jpdb?tid=1")
    }

    @Test
    fun darkVocabularyColorsMeetReadableTextContrast() {
        val css = cssForPresentation(HtmlPresentationSpec(darkMode = true, fontSizeSp = 18f))
        fun luminance(hex: String): Double {
            val channels = hex.chunked(2).map { it.toInt(16) / 255.0 }.map {
                if (it <= 0.04045) it / 12.92 else Math.pow((it + 0.055) / 1.055, 2.4)
            }
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        }
        val background = luminance("0B0E12")
        val colors = Regex("--pr-word-[a-z]+: #([A-Fa-f0-9]{6})").findAll(css).toList()
        assertEquals(6, colors.size)
        colors.forEach { kotlin.test.assertTrue((luminance(it.groupValues[1]) + 0.05) / (background + 0.05) >= 4.5, it.value) }
    }

    @Test
    fun cssForPresentation_reflects_theme_and_font_size() {
        val light =
            cssForPresentation(
                HtmlPresentationSpec(
                    darkMode = false,
                    fontSizeSp = 19f,
                ),
            )
        val dark =
            cssForPresentation(
                HtmlPresentationSpec(
                    darkMode = true,
                    fontSizeSp = 16f,
                ),
            )

        assertContains(light, "--pr-bg: #F4F1EB;")
        assertContains(light, "--pr-font-size: 19.0pt;")
        assertContains(dark, "--pr-bg: #0B0E12;")
        assertContains(dark, "color-scheme: dark;")
    }

    @Test
    fun buildDocumentHtml_embeds_head_and_body_in_single_document() {
        val html =
            buildDocumentHtml(
                document =
                    HtmlDocumentSpec(
                        bodyHtml = "<p>Hello</p>",
                        headHtml = "<style>.x{color:red;}</style>",
                        baseUrl = "https://example.com",
                        chapterKey = "book:1",
                        contentKey = "book:1:body",
                    ),
                presentation =
                    HtmlPresentationSpec(
                        darkMode = false,
                        fontSizeSp = 18f,
                    ),
            )

        assertContains(html, "<style id=\"pr-base-style\">")
        assertContains(html, "<style>.x{color:red;}</style>")
        assertContains(html, "<body id=\"pr-reader-body\"><p>Hello</p></body>")
        assertEquals(1, "<meta name=\"viewport\"".toRegex().findAll(html).count())
    }
}

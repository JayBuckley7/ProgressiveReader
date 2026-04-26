package com.progressivereader.kmp.reader

import kotlin.test.assertContains
import kotlin.test.assertEquals
import org.junit.Test

class HtmlRendererTest {
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
        assertContains(html, "<body><p>Hello</p></body>")
        assertEquals(1, "<meta name=\"viewport\"".toRegex().findAll(html).count())
    }
}

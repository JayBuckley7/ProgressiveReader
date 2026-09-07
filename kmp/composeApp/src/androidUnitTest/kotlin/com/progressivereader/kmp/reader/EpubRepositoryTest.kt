package com.progressivereader.kmp.reader

import java.io.File
import java.nio.file.Files
import kotlin.test.assertEquals
import kotlinx.coroutines.runBlocking
import org.junit.Test

class EpubRepositoryTest {
    @Test
    fun loadBook_skipsImageOnlyFrontMatter_whenTextChaptersExist() = runBlocking {
        val root = Files.createTempDirectory("pr-epub-readable-spine").toFile()
        writePackage(
            root = root,
            chapters =
                listOf(
                    "cover.xhtml" to "<body><img src=\"cover.jpg\" alt=\"\"/></body>",
                    "plate.xhtml" to "<body><p><img src=\"plate.jpg\" alt=\"\"/></p></body>",
                    "toc.xhtml" to "<body><p>目次</p></body>",
                    "chapter.xhtml" to "<body><p>物語が始まる。</p></body>",
                ),
        )

        val book = EpubRepository().loadBook(root)

        assertEquals(listOf("OPS/toc.xhtml", "OPS/chapter.xhtml"), book.chapters.map { it.href })
    }

    @Test
    fun loadBook_keepsOriginalSpine_forImageOnlyBooks() = runBlocking {
        val root = Files.createTempDirectory("pr-epub-image-spine").toFile()
        writePackage(
            root = root,
            chapters =
                listOf(
                    "page-1.xhtml" to "<body><img src=\"1.jpg\" alt=\"\"/></body>",
                    "page-2.xhtml" to "<body><img src=\"2.jpg\" alt=\"\"/></body>",
                ),
        )

        val book = EpubRepository().loadBook(root)

        assertEquals(listOf("OPS/page-1.xhtml", "OPS/page-2.xhtml"), book.chapters.map { it.href })
    }

    @Test
    fun loadBook_carriesNavigationTitleFromImageHeadingIntoFollowingText() = runBlocking {
        val root = Files.createTempDirectory("pr-epub-heading-title").toFile()
        writePackage(
            root = root,
            chapters =
                listOf(
                    "heading.xhtml" to "<body><img src=\"chapter-heading.jpg\" alt=\"\"/></body>",
                    "chapter.xhtml" to "<body><p>第一章の本文。</p></body>",
                ),
            navigation = listOf("heading.xhtml#start" to "第一章　生きるということ"),
        )

        val book = EpubRepository().loadBook(root)

        assertEquals(listOf("OPS/chapter.xhtml"), book.chapters.map { it.href })
        assertEquals(listOf("第一章　生きるということ"), book.chapters.map { it.title })
    }

    @Test
    fun loadBook_splitsOversizedTextDocuments_intoLoadableReaderSections() = runBlocking {
        val root = Files.createTempDirectory("pr-epub-split-spine").toFile()
        val largeBody =
            buildString {
                append("<body><div class=\"main\">")
                repeat(4) { index ->
                    append("<p>")
                    append(('あ'.code + index).toChar().toString().repeat(6_000))
                    append("</p>")
                }
                append("</div></body>")
            }
        writePackage(
            root = root,
            chapters = listOf("large.xhtml" to largeBody),
            navigation = listOf("large.xhtml#chapter-start" to "第一章"),
        )

        val repository = EpubRepository()
        val book = repository.loadBook(root)

        assertEquals(2, book.chapters.size)
        assertEquals("OPS/large.xhtml#pr-reader-part=0", book.chapters[0].href)
        assertEquals("OPS/large.xhtml#pr-reader-part=1", book.chapters[1].href)
        assertEquals(listOf("第一章", "第一章"), book.chapters.map { it.title })
        assertEquals(listOf(0, 1), book.chapters.map { it.partIndex })
        assertEquals(listOf(2, 2), book.chapters.map { it.partCount })
        assertEquals(listOf("OPS/large.xhtml", "OPS/large.xhtml"), book.chapters.map { it.navigationId })
        val first = repository.loadSanitizedChapterHtml(root, book.chapters[0].href)
        val second = repository.loadSanitizedChapterHtml(root, book.chapters[1].href)
        assertEquals(12_000, first?.let { readableCharacterCount(it.bodyHtml) })
        assertEquals(12_000, second?.let { readableCharacterCount(it.bodyHtml) })

        File(root, "OPS/content.opf").delete()
        assertEquals(book, EpubRepository().loadBook(root))
    }

    private fun writePackage(
        root: File,
        chapters: List<Pair<String, String>>,
        navigation: List<Pair<String, String>> = emptyList(),
    ) {
        File(root, "META-INF").mkdirs()
        File(root, "META-INF/container.xml").writeText(
            """
            <?xml version="1.0"?>
            <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
              <rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles>
            </container>
            """.trimIndent(),
        )
        File(root, "OPS").mkdirs()
        chapters.forEach { (name, body) ->
            File(root, "OPS/$name").writeText("<html xmlns=\"http://www.w3.org/1999/xhtml\">$body</html>")
        }
        if (navigation.isNotEmpty()) {
            val links = navigation.joinToString(separator = "") { (href, label) -> "<li><a href=\"$href\">$label</a></li>" }
            File(root, "OPS/navigation.xhtml").writeText(
                "<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\"><body><nav epub:type=\"toc\"><ol>$links</ol></nav></body></html>",
            )
        }

        val manifest =
            chapters.mapIndexed { index, (name, _) ->
                "<item id=\"chapter-$index\" href=\"$name\" media-type=\"application/xhtml+xml\"/>"
            }.joinToString("\n") +
                if (navigation.isEmpty()) {
                    ""
                } else {
                    "\n<item id=\"navigation\" href=\"navigation.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>"
                }
        val spine =
            chapters.indices.joinToString("\n") { index ->
                "<itemref idref=\"chapter-$index\"/>"
            }
        File(root, "OPS/content.opf").writeText(
            """
            <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
              <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test book</dc:title></metadata>
              <manifest>$manifest</manifest>
              <spine>$spine</spine>
            </package>
            """.trimIndent(),
        )
    }

    private fun readableCharacterCount(bodyHtml: String): Int =
        org.jsoup.Jsoup.parseBodyFragment(bodyHtml).text().count { !it.isWhitespace() }
}

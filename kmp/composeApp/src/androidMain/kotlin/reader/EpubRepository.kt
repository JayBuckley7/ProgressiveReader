package com.progressivereader.kmp.reader

import java.io.File
import java.io.FileInputStream
import java.util.zip.ZipInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.xmlpull.v1.XmlPullParserFactory

class EpubRepository {
    suspend fun extractIfNeeded(epubFile: File, extractedDir: File) =
        withContext(Dispatchers.IO) {
            val containerFile = File(extractedDir, "META-INF/container.xml")
            if (containerFile.exists()) return@withContext

            if (extractedDir.exists()) extractedDir.deleteRecursively()
            extractedDir.mkdirs()

            ZipInputStream(FileInputStream(epubFile)).use { zis ->
                var entry = zis.nextEntry
                while (entry != null) {
                    if (!entry.isDirectory) {
                        val outFile = File(extractedDir, entry.name)
                        ensureWithinDir(extractedDir, outFile)
                        outFile.parentFile?.mkdirs()
                        outFile.outputStream().use { os -> zis.copyTo(os) }
                    }
                    entry = zis.nextEntry
                }
            }
        }

    suspend fun loadBook(extractedDir: File): EpubBook =
        withContext(Dispatchers.IO) {
            val opfPath = readOpfPath(extractedDir)
            val opfFile = File(extractedDir, opfPath)
            if (!opfFile.exists()) {
                return@withContext EpubBook(title = "Untitled", chapters = emptyList())
            }

            val opfText = opfFile.readText()
            val title = readDcTitle(opfText) ?: "Untitled"

            val opfDirPrefix = opfPath.substringBeforeLast('/', missingDelimiterValue = "")
            val manifestIdToHref = readOpfManifest(opfText)
            val spineIdRefs = readOpfSpine(opfText)

            val chapters =
                spineIdRefs
                    .mapNotNull { idref -> manifestIdToHref[idref] }
                    .map { href ->
                        if (opfDirPrefix.isBlank()) href else "$opfDirPrefix/$href"
                    }
                    .filter {
                        it.endsWith(".xhtml", ignoreCase = true) ||
                            it.endsWith(".html", ignoreCase = true) ||
                            it.endsWith(".htm", ignoreCase = true)
                    }
                    .map { href -> EpubChapter(href = href, title = href.substringAfterLast('/')) }

            EpubBook(title = title, chapters = chapters)
        }

    suspend fun loadChapterHtml(extractedDir: File, href: String): String? =
        withContext(Dispatchers.IO) {
            val f = File(extractedDir, href)
            if (!f.exists()) return@withContext null
            f.readText()
        }

    fun chapterBaseUrl(extractedDir: File, href: String): String? {
        val f = File(extractedDir, href)
        val uri = f.parentFile?.toURI()?.toString() ?: return null
        return if (uri.endsWith("/")) uri else "$uri/"
    }

    private fun ensureWithinDir(root: File, child: File) {
        val rootPath = root.canonicalFile.toPath()
        val childPath = child.canonicalFile.toPath()
        require(childPath.startsWith(rootPath)) { "Zip entry escapes target dir: $child" }
    }

    private fun readOpfPath(extractedDir: File): String {
        val containerFile = File(extractedDir, "META-INF/container.xml")
        val xml = containerFile.readText()
        val regex = Regex("full-path\\s*=\\s*\"([^\"]+)\"")
        return regex.find(xml)?.groupValues?.get(1) ?: "content.opf"
    }

    private fun readDcTitle(opfXml: String): String? {
        val regex =
            Regex(
                pattern = "<dc:title[^>]*>(.*?)</dc:title>",
                options = setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
            )
        return regex.find(opfXml)?.groupValues?.get(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    private fun readOpfManifest(opfXml: String): Map<String, String> {
        val factory = XmlPullParserFactory.newInstance()
        factory.isNamespaceAware = true
        val parser = factory.newPullParser()
        parser.setInput(opfXml.reader())

        val idToHref = linkedMapOf<String, String>()
        var event = parser.eventType
        while (event != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
            if (event == org.xmlpull.v1.XmlPullParser.START_TAG && parser.name.equals("item", ignoreCase = true)) {
                val id = parser.getAttributeValue(null, "id")
                val href = parser.getAttributeValue(null, "href")
                if (!id.isNullOrBlank() && !href.isNullOrBlank()) idToHref[id] = href
            }
            event = parser.next()
        }
        return idToHref
    }

    private fun readOpfSpine(opfXml: String): List<String> {
        val factory = XmlPullParserFactory.newInstance()
        factory.isNamespaceAware = true
        val parser = factory.newPullParser()
        parser.setInput(opfXml.reader())

        val idRefs = mutableListOf<String>()
        var event = parser.eventType
        while (event != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
            if (event == org.xmlpull.v1.XmlPullParser.START_TAG && parser.name.equals("itemref", ignoreCase = true)) {
                val idref = parser.getAttributeValue(null, "idref")
                if (!idref.isNullOrBlank()) idRefs.add(idref)
            }
            event = parser.next()
        }
        return idRefs
    }
}


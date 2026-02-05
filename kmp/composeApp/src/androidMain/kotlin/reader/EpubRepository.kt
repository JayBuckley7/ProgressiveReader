package com.progressivereader.kmp.reader

import java.io.File
import java.io.FileInputStream
import java.nio.charset.Charset
import java.util.zip.ZipInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.xmlpull.v1.XmlPullParserFactory

data class SanitizedChapterHtml(
    val headHtml: String,
    val bodyHtml: String,
) {
    fun combinedHtml(): String = headHtml + bodyHtml
}

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
            val manifestIdToHref = readOpfManifest(opfText).mapValues { it.value.href }
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

    suspend fun extractCoverIfNeeded(extractedDir: File, bookDir: File): File? =
        withContext(Dispatchers.IO) {
            val existing =
                bookDir
                    .listFiles()
                    ?.firstOrNull { it.isFile && it.name.startsWith("cover.") && it.length() > 0 }
            if (existing != null) return@withContext existing

            val opfPath = readOpfPath(extractedDir)
            val opfFile = File(extractedDir, opfPath)
            if (!opfFile.exists()) return@withContext null

            val opfText = opfFile.readText()
            val opfDirPrefix = opfPath.substringBeforeLast('/', missingDelimiterValue = "")
            val manifest = readOpfManifest(opfText)
            val src =
                findCoverSourceFile(
                    extractedDir = extractedDir,
                    opfDirPrefix = opfDirPrefix,
                    opfXml = opfText,
                    manifest = manifest,
                ) ?: return@withContext null

            val ext = src.extension.lowercase().takeIf { it.isNotBlank() } ?: "jpg"
            val dest = File(bookDir, "cover.$ext")
            dest.parentFile?.mkdirs()
            src.copyTo(dest, overwrite = true)
            dest
        }

    suspend fun loadSanitizedChapterHtml(extractedDir: File, href: String): SanitizedChapterHtml? {
        val f = File(extractedDir, href)
        if (!f.exists()) return null

        val bytes = withContext(Dispatchers.IO) { f.readBytes() }
        return withContext(Dispatchers.Default) { sanitizeChapterBytes(bytes) }
    }

    suspend fun loadChapterHtml(extractedDir: File, href: String): String? =
        loadSanitizedChapterHtml(extractedDir, href)?.combinedHtml()

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

    private fun sanitizeChapterBytes(bytes: ByteArray): SanitizedChapterHtml {
        val decoded = decodeWithDetectedCharset(bytes)

        val doc = Jsoup.parse(decoded).apply { outputSettings().prettyPrint(false) }
        doc.select("script, iframe, object, embed, form").remove()

        val headExtras =
            buildString {
                doc.head().select("link[rel=stylesheet], style").forEach { el ->
                    if (el.tagName().equals("link", ignoreCase = true)) {
                        val href = el.attr("href").trim()
                        if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) return@forEach
                    }
                    append(el.outerHtml())
                }
            }

        val bodyInner = doc.body().html()
        return SanitizedChapterHtml(headHtml = headExtras, bodyHtml = bodyInner)
    }

    private fun decodeWithDetectedCharset(bytes: ByteArray): String {
        val sniffLen = minOf(bytes.size, 8192)
        val sniff = String(bytes, 0, sniffLen, Charsets.ISO_8859_1)
        val declared = detectDeclaredEncoding(sniff)

        fun decodeOrNull(charsetName: String): String? =
            runCatching { String(bytes, Charset.forName(charsetName)) }.getOrNull()

        if (!declared.isNullOrBlank()) {
            decodeOrNull(declared)?.let { return it }
            // Common aliases found in EPUBs
            if (declared.equals("shift_jis", ignoreCase = true) || declared.equals("shift-jis", ignoreCase = true)) {
                decodeOrNull("windows-31j")?.let { return it }
            }
        }

        val utf8 = String(bytes, Charsets.UTF_8)
        if (!looksLikeBadUtf8(utf8)) return utf8

        val win31j = decodeOrNull("windows-31j")
        return if (win31j != null && replacementRatio(win31j) < replacementRatio(utf8)) win31j else utf8
    }

    private fun detectDeclaredEncoding(sniff: String): String? {
        val xml =
            Regex("(?i)<\\?xml[^>]*encoding\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]")
                .find(sniff)
                ?.groupValues
                ?.getOrNull(1)
        if (!xml.isNullOrBlank()) return xml.trim()

        val metaCharset =
            Regex("(?i)<meta[^>]+charset\\s*=\\s*['\\\"]?\\s*([^'\\\"\\s/>]+)")
                .find(sniff)
                ?.groupValues
                ?.getOrNull(1)
        if (!metaCharset.isNullOrBlank()) return metaCharset.trim()

        val metaHttpEquiv =
            Regex("(?i)charset\\s*=\\s*([^'\\\"\\s;>]+)")
                .find(sniff)
                ?.groupValues
                ?.getOrNull(1)
        if (!metaHttpEquiv.isNullOrBlank()) return metaHttpEquiv.trim()

        return null
    }

    private fun looksLikeBadUtf8(decodedUtf8: String): Boolean {
        if (decodedUtf8.isBlank()) return false
        return replacementRatio(decodedUtf8) > 0.01f
    }

    private fun replacementRatio(s: String): Float {
        if (s.isEmpty()) return 0f
        val repl = s.count { it == '\uFFFD' }
        return repl.toFloat() / s.length.toFloat()
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

    private fun readOpfManifest(opfXml: String): Map<String, ManifestItem> {
        val factory = XmlPullParserFactory.newInstance()
        factory.isNamespaceAware = true
        val parser = factory.newPullParser()
        parser.setInput(opfXml.reader())

        val idToItem = linkedMapOf<String, ManifestItem>()
        var event = parser.eventType
        while (event != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
            if (event == org.xmlpull.v1.XmlPullParser.START_TAG && parser.name.equals("item", ignoreCase = true)) {
                val id = parser.getAttributeValue(null, "id")
                val href = parser.getAttributeValue(null, "href")
                val mediaType = parser.getAttributeValue(null, "media-type")
                val properties = parser.getAttributeValue(null, "properties")
                if (!id.isNullOrBlank() && !href.isNullOrBlank()) {
                    idToItem[id] = ManifestItem(id = id, href = href, mediaType = mediaType, properties = properties)
                }
            }
            event = parser.next()
        }
        return idToItem
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

    private data class ManifestItem(
        val id: String,
        val href: String,
        val mediaType: String? = null,
        val properties: String? = null,
    )

    private fun findCoverSourceFile(
        extractedDir: File,
        opfDirPrefix: String,
        opfXml: String,
        manifest: Map<String, ManifestItem>,
    ): File? {
        val coverId = readCoverIdFromMeta(opfXml)
        if (!coverId.isNullOrBlank()) {
            val item = manifest[coverId]
            if (item != null) {
                val itemFile = resolveManifestFile(extractedDir, opfDirPrefix, item.href)
                if (item.mediaType?.startsWith("image/", ignoreCase = true) == true) {
                    if (itemFile?.exists() == true) return itemFile
                } else if (itemFile?.exists() == true) {
                    val coverFromDoc = findCoverImageInDoc(itemFile)
                    if (coverFromDoc?.exists() == true) return coverFromDoc
                }
            }
        }

        val coverByProperty =
            manifest.values.firstOrNull {
                it.properties?.contains("cover-image", ignoreCase = true) == true &&
                    it.mediaType?.startsWith("image/", ignoreCase = true) == true
            }
        if (coverByProperty != null) {
            val f = resolveManifestFile(extractedDir, opfDirPrefix, coverByProperty.href)
            if (f?.exists() == true) return f
        }

        val guideHref = readCoverHrefFromGuide(opfXml)
        if (!guideHref.isNullOrBlank()) {
            val f = resolveManifestFile(extractedDir, opfDirPrefix, guideHref)
            if (f?.exists() == true) {
                if (isLikelyImageFile(f)) return f
                val coverFromDoc = findCoverImageInDoc(f)
                if (coverFromDoc?.exists() == true) return coverFromDoc
            }
        }

        val heuristic =
            manifest.values.firstOrNull {
                it.mediaType?.startsWith("image/", ignoreCase = true) == true &&
                    (it.id.contains("cover", ignoreCase = true) || it.href.contains("cover", ignoreCase = true))
            }
        if (heuristic != null) {
            val f = resolveManifestFile(extractedDir, opfDirPrefix, heuristic.href)
            if (f?.exists() == true) return f
        }

        // Many EPUBs place a cover page first in the spine but omit explicit cover metadata.
        val firstSpineIdRef = runCatching { readOpfSpine(opfXml).firstOrNull() }.getOrNull()
        if (!firstSpineIdRef.isNullOrBlank()) {
            val item = manifest[firstSpineIdRef]
            val itemFile = item?.let { resolveManifestFile(extractedDir, opfDirPrefix, it.href) }
            if (itemFile?.exists() == true) {
                if (item?.mediaType?.startsWith("image/", ignoreCase = true) == true) return itemFile
                val coverFromDoc = findCoverImageInDoc(itemFile)
                if (coverFromDoc?.exists() == true) return coverFromDoc
            }
        }

        val coverLike = findLargestCoverLikeImage(extractedDir)
        if (coverLike != null) return coverLike

        return findLargestImageInManifest(extractedDir, opfDirPrefix, manifest)
    }

    private fun resolveManifestFile(extractedDir: File, opfDirPrefix: String, href: String): File? {
        val trimmed = href.substringBefore('#').substringBefore('?').trim().trimStart('/')
        if (trimmed.isBlank()) return null
        val rel = if (opfDirPrefix.isBlank()) trimmed else "$opfDirPrefix/$trimmed"
        return File(extractedDir, rel)
    }

    private fun isLikelyImageFile(f: File): Boolean {
        val ext = f.extension.lowercase()
        return ext == "jpg" || ext == "jpeg" || ext == "png" || ext == "webp" || ext == "gif" || ext == "bmp"
    }

    private fun findCoverImageInDoc(docFile: File): File? {
        val text = runCatching { docFile.readText() }.getOrNull() ?: return null
        val imgRegex = Regex("(?i)<img[^>]+src\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]")
        val svgRegex = Regex("(?i)<image[^>]+(?:href|xlink:href)\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]")
        val raw =
            imgRegex.find(text)?.groupValues?.getOrNull(1)
                ?: svgRegex.find(text)?.groupValues?.getOrNull(1)
                ?: return null

        val path =
            raw
                .substringBefore('#')
                .substringBefore('?')
                .trim()
                .trimStart('/')
                .takeIf { it.isNotBlank() }
                ?: return null

        return File(docFile.parentFile, path)
    }

    private fun findLargestCoverLikeImage(extractedDir: File): File? {
        val exts = setOf("jpg", "jpeg", "png", "webp", "gif")
        val candidates =
            extractedDir
                .walkTopDown()
                .filter { it.isFile }
                .filter { exts.contains(it.extension.lowercase()) }
                .filter { it.name.contains("cover", ignoreCase = true) || it.path.contains("/cover", ignoreCase = true) }
                .toList()

        return candidates.maxByOrNull { it.length() }
    }

    private fun findLargestImageInManifest(
        extractedDir: File,
        opfDirPrefix: String,
        manifest: Map<String, ManifestItem>,
    ): File? {
        val images =
            manifest.values
                .filter { it.mediaType?.startsWith("image/", ignoreCase = true) == true }
                .mapNotNull { resolveManifestFile(extractedDir, opfDirPrefix, it.href) }
                .filter { it.exists() }
                .toList()

        return images.maxByOrNull { it.length() }
    }

    private fun readCoverIdFromMeta(opfXml: String): String? {
        val factory = XmlPullParserFactory.newInstance()
        factory.isNamespaceAware = true
        val parser = factory.newPullParser()
        parser.setInput(opfXml.reader())

        var event = parser.eventType
        while (event != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
            if (event == org.xmlpull.v1.XmlPullParser.START_TAG && parser.name.equals("meta", ignoreCase = true)) {
                val name = parser.getAttributeValue(null, "name")
                val content = parser.getAttributeValue(null, "content")
                if (name.equals("cover", ignoreCase = true) && !content.isNullOrBlank()) return content

                val property = parser.getAttributeValue(null, "property")
                if (property.equals("cover", ignoreCase = true)) {
                    val text = runCatching { parser.nextText() }.getOrNull()
                    if (!text.isNullOrBlank()) return text.trim()
                }
            }
            event = parser.next()
        }
        return null
    }

    private fun readCoverHrefFromGuide(opfXml: String): String? {
        val factory = XmlPullParserFactory.newInstance()
        factory.isNamespaceAware = true
        val parser = factory.newPullParser()
        parser.setInput(opfXml.reader())

        var event = parser.eventType
        while (event != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
            if (event == org.xmlpull.v1.XmlPullParser.START_TAG && parser.name.equals("reference", ignoreCase = true)) {
                val type = parser.getAttributeValue(null, "type")
                val href = parser.getAttributeValue(null, "href")
                if (type.equals("cover", ignoreCase = true) && !href.isNullOrBlank()) return href
            }
            event = parser.next()
        }
        return null
    }
}

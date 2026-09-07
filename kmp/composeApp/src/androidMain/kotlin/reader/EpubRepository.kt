package com.progressivereader.kmp.reader

import java.io.File
import java.io.FileInputStream
import java.net.URLDecoder
import java.nio.charset.Charset
import java.security.MessageDigest
import java.util.zip.ZipInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode
import org.xmlpull.v1.XmlPullParserFactory

private const val READER_PART_MARKER = "#pr-reader-part="
private const val MAX_READER_PART_TEXT_CHARS = 16_000
private const val PREPARED_BOOK_VERSION = 1
private const val PREPARED_CACHE_DIR = ".progressive-reader"
private const val PREPARED_BOOK_FILE = "book-v1.json"

@Serializable
data class SanitizedChapterHtml(
    val headHtml: String,
    val bodyHtml: String,
) {
    fun combinedHtml(): String = headHtml + bodyHtml
}

class EpubRepository {
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

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
            readPreparedBook(extractedDir)?.let { return@withContext it }

            val opfPath = readOpfPath(extractedDir)
            val opfFile = File(extractedDir, opfPath)
            if (!opfFile.exists()) {
                return@withContext EpubBook(title = "Untitled", chapters = emptyList())
            }

            val opfText = opfFile.readText()
            val title = readDcTitle(opfText) ?: "Untitled"

            val opfDirPrefix = opfPath.substringBeforeLast('/', missingDelimiterValue = "")
            val manifest = readOpfManifest(opfText)
            val spineIdRefs = readOpfSpine(opfText)
            val navigationTitles = readNavigationTitles(extractedDir, opfDirPrefix, manifest)

            val spineChapters =
                spineIdRefs
                    .mapNotNull { idref -> manifest[idref]?.href }
                    .map { href ->
                        if (opfDirPrefix.isBlank()) href else "$opfDirPrefix/$href"
                    }
                    .filter {
                        it.endsWith(".xhtml", ignoreCase = true) ||
                            it.endsWith(".html", ignoreCase = true) ||
                            it.endsWith(".htm", ignoreCase = true)
                    }
                    .map { href ->
                        val sourceHref = normalizePublicationPath(href)
                        EpubChapter(
                            href = sourceHref,
                            title =
                                navigationTitles[sourceHref]
                                    ?: readDocumentTitle(File(extractedDir, sourceHref))
                                    ?: sourceHref.substringAfterLast('/').substringBeforeLast('.'),
                            navigationId = sourceHref,
                        )
                    }

            // Many Japanese EPUBs put the cover and several full-page illustrations in the
            // spine before the first readable section. Treating each of those files as a
            // chapter makes Next appear broken because the user traverses a run of pages with
            // no text (and JPDB correctly returns zero tokens for every one). Keep text-bearing
            // spine documents for normal books, while retaining the original spine as a
            // fallback for image-only EPUBs such as comics.
            val readableChapters = mutableListOf<EpubChapter>()
            var pendingNavigationTitle: String? = null
            spineChapters.forEach { chapter ->
                val hasNavigationTitle = navigationTitles.containsKey(chapter.href)
                val expanded = expandReadableChapter(extractedDir, chapter)
                if (expanded.isEmpty()) {
                    if (hasNavigationTitle) pendingNavigationTitle = chapter.title
                    return@forEach
                }

                val title =
                    when {
                        hasNavigationTitle -> chapter.title
                        !pendingNavigationTitle.isNullOrBlank() -> pendingNavigationTitle.orEmpty()
                        else -> chapter.title
                    }
                readableChapters += expanded.map { it.copy(title = title) }
                pendingNavigationTitle = null
            }
            val chapters = readableChapters.ifEmpty { spineChapters }

            EpubBook(title = title, chapters = chapters).also { writePreparedBook(extractedDir, it) }
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
        withContext(Dispatchers.IO) { readPreparedChapter(extractedDir, href) }?.let { return it }

        val reference = parseReaderChapterReference(href)
        val f = File(extractedDir, reference.sourceHref)
        if (!f.exists()) return null

        val bytes = withContext(Dispatchers.IO) { f.readBytes() }
        return withContext(Dispatchers.Default) {
            val sanitized = sanitizeChapterBytes(bytes)
            val partIndex = reference.partIndex ?: return@withContext sanitized
            val parts = splitReadableBody(sanitized.bodyHtml)
            val bodyPart = parts.getOrNull(partIndex) ?: return@withContext null
            sanitized.copy(bodyHtml = bodyPart)
        }
    }

    suspend fun loadChapterHtml(extractedDir: File, href: String): String? =
        loadSanitizedChapterHtml(extractedDir, href)?.combinedHtml()

    fun chapterBaseUrl(extractedDir: File, href: String): String? {
        val f = File(extractedDir, parseReaderChapterReference(href).sourceHref)
        val uri = f.parentFile?.toURI()?.toString() ?: return null
        return if (uri.endsWith("/")) uri else "$uri/"
    }

    private fun ensureWithinDir(root: File, child: File) {
        val rootPath = root.canonicalFile.path.trimEnd(File.separatorChar)
        val childPath = child.canonicalFile.path
        val rootPrefix = "$rootPath${File.separator}"
        require(childPath == rootPath || childPath.startsWith(rootPrefix)) {
            "Zip entry escapes target dir: $child"
        }
    }

    private data class ReaderChapterReference(
        val sourceHref: String,
        val partIndex: Int?,
    )

    private fun parseReaderChapterReference(href: String): ReaderChapterReference {
        val markerIndex = href.lastIndexOf(READER_PART_MARKER)
        if (markerIndex < 0) return ReaderChapterReference(sourceHref = href, partIndex = null)

        val partIndex = href.substring(markerIndex + READER_PART_MARKER.length).toIntOrNull()
        return if (partIndex == null) {
            ReaderChapterReference(sourceHref = href, partIndex = null)
        } else {
            ReaderChapterReference(sourceHref = href.substring(0, markerIndex), partIndex = partIndex)
        }
    }

    private fun expandReadableChapter(extractedDir: File, chapter: EpubChapter): List<EpubChapter> {
        val file = File(extractedDir, chapter.href)
        if (!file.isFile) return emptyList()

        val sanitized = runCatching { sanitizeChapterBytes(file.readBytes()) }.getOrNull() ?: return emptyList()
        val parts = splitReadableBody(sanitized.bodyHtml)
        if (parts.isEmpty()) return emptyList()
        if (parts.size == 1) {
            writePreparedChapter(extractedDir, chapter.href, sanitized)
            return listOf(chapter)
        }

        return parts.mapIndexed { index, bodyHtml ->
            val partHref = "${chapter.href}$READER_PART_MARKER$index"
            writePreparedChapter(extractedDir, partHref, sanitized.copy(bodyHtml = bodyHtml))
            EpubChapter(
                href = partHref,
                title = chapter.title,
                navigationId = chapter.navigationId,
                partIndex = index,
                partCount = parts.size,
            )
        }
    }

    private fun readPreparedBook(extractedDir: File): EpubBook? {
        val file = File(File(extractedDir, PREPARED_CACHE_DIR), PREPARED_BOOK_FILE)
        if (!file.isFile) return null
        val cache = runCatching { json.decodeFromString<PreparedBookCache>(file.readText()) }.getOrNull() ?: return null
        return cache.book.takeIf { cache.version == PREPARED_BOOK_VERSION && it.chapters.isNotEmpty() }
    }

    private fun writePreparedBook(extractedDir: File, book: EpubBook) {
        val file = File(File(extractedDir, PREPARED_CACHE_DIR), PREPARED_BOOK_FILE)
        writeAtomically(file, json.encodeToString(PreparedBookCache(version = PREPARED_BOOK_VERSION, book = book)))
    }

    private fun readPreparedChapter(extractedDir: File, href: String): SanitizedChapterHtml? {
        val file = preparedChapterFile(extractedDir, href)
        if (!file.isFile) return null
        return runCatching { json.decodeFromString<SanitizedChapterHtml>(file.readText()) }.getOrNull()
    }

    private fun writePreparedChapter(
        extractedDir: File,
        href: String,
        chapter: SanitizedChapterHtml,
    ) {
        writeAtomically(preparedChapterFile(extractedDir, href), json.encodeToString(chapter))
    }

    private fun preparedChapterFile(extractedDir: File, href: String): File {
        val digest =
            MessageDigest.getInstance("SHA-256")
                .digest(href.toByteArray(Charsets.UTF_8))
                .joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }
        return File(File(File(extractedDir, PREPARED_CACHE_DIR), "chapters"), "$digest.json")
    }

    private fun writeAtomically(file: File, content: String) {
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, "${file.name}.tmp")
        temporary.writeText(content)
        if (!temporary.renameTo(file)) {
            temporary.copyTo(file, overwrite = true)
            temporary.delete()
        }
    }

    @Serializable
    private data class PreparedBookCache(
        val version: Int,
        val book: EpubBook,
    )

    private fun splitReadableBody(bodyHtml: String): List<String> {
        val doc = Jsoup.parseBodyFragment(bodyHtml).apply { outputSettings().prettyPrint(false) }
        val body = doc.body()
        val wrapper = body.children().singleOrNull()?.takeIf { it.hasClass("main") }
        val sourceNodes = (wrapper ?: body).childNodes()
        if (sourceNodes.isEmpty()) return emptyList()

        val parts = mutableListOf<String>()
        val current = mutableListOf<String>()
        var currentTextLength = 0

        fun flush() {
            if (current.isEmpty()) return
            val innerHtml = current.joinToString(separator = "")
            val html = if (wrapper == null) innerHtml else wrapLike(wrapper, innerHtml)
            if (readableTextLength(Jsoup.parseBodyFragment(html).body()) > 0) parts += html
            current.clear()
            currentTextLength = 0
        }

        sourceNodes.forEach { node ->
            val nodeTextLength = readableTextLength(node)
            if (nodeTextLength > 0 && currentTextLength > 0 && currentTextLength + nodeTextLength > MAX_READER_PART_TEXT_CHARS) {
                flush()
            }
            current += node.outerHtml()
            currentTextLength += nodeTextLength
        }
        flush()
        return parts
    }

    private fun wrapLike(wrapper: Element, innerHtml: String): String {
        val copy = Element(wrapper.tag(), wrapper.baseUri())
        wrapper.attributes().forEach { attribute -> copy.attr(attribute.key, attribute.value) }
        copy.html(innerHtml)
        return copy.outerHtml()
    }

    private fun readableTextLength(node: Node): Int {
        val text =
            when (node) {
                is TextNode -> node.getWholeText()
                is Element -> node.text()
                else -> ""
            }
        return text.replace('\u00A0', ' ').count { !it.isWhitespace() }
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
        return regex.find(opfXml)?.groupValues?.get(1)?.let { Jsoup.parse(it).text().trim() }?.takeIf { it.isNotBlank() }
    }

    private fun readNavigationTitles(
        extractedDir: File,
        opfDirPrefix: String,
        manifest: Map<String, ManifestItem>,
    ): Map<String, String> {
        val titles = linkedMapOf<String, String>()

        val navItem =
            manifest.values.firstOrNull { item ->
                item.properties
                    ?.split(Regex("\\s+"))
                    ?.any { it.equals("nav", ignoreCase = true) } == true
            }
        val navFile = navItem?.let { resolveManifestFile(extractedDir, opfDirPrefix, it.href) }
        if (navFile?.isFile == true) {
            val document = runCatching { Jsoup.parse(decodeWithDetectedCharset(navFile.readBytes())) }.getOrNull()
            val navs = document?.select("nav").orEmpty()
            val tocNav =
                navs.firstOrNull { nav ->
                    nav.attr("epub:type").equals("toc", ignoreCase = true) ||
                        nav.attr("type").equals("toc", ignoreCase = true) ||
                        nav.attr("role").equals("doc-toc", ignoreCase = true)
                } ?: navs.firstOrNull()
            tocNav?.select("a[href]")?.forEach { link ->
                val href = resolveNavigationHref(extractedDir, navFile, link.attr("href")) ?: return@forEach
                val label = link.text().trim()
                if (label.isNotBlank()) titles.putIfAbsent(href, label)
            }
        }

        val ncxItem =
            manifest.values.firstOrNull { item ->
                item.mediaType.equals("application/x-dtbncx+xml", ignoreCase = true) ||
                    item.href.endsWith(".ncx", ignoreCase = true)
            }
        val ncxFile = ncxItem?.let { resolveManifestFile(extractedDir, opfDirPrefix, it.href) }
        if (ncxFile?.isFile == true) {
            val document = runCatching { Jsoup.parse(decodeWithDetectedCharset(ncxFile.readBytes())) }.getOrNull()
            document?.select("navPoint")?.forEach { point ->
                val source = point.selectFirst("content[src]")?.attr("src") ?: return@forEach
                val href = resolveNavigationHref(extractedDir, ncxFile, source) ?: return@forEach
                val label = point.selectFirst("navLabel > text")?.text()?.trim().orEmpty()
                if (label.isNotBlank()) titles.putIfAbsent(href, label)
            }
        }

        return titles
    }

    private fun resolveNavigationHref(
        extractedDir: File,
        navigationFile: File,
        rawHref: String,
    ): String? {
        val path = decodeHrefPath(rawHref)
        if (path.isBlank()) return null
        val root = extractedDir.canonicalFile
        val target = File(navigationFile.parentFile, path).canonicalFile
        val rootPrefix = "${root.path.trimEnd(File.separatorChar)}${File.separator}"
        if (target.path != root.path && !target.path.startsWith(rootPrefix)) return null
        return target.relativeTo(root).invariantSeparatorsPath
    }

    private fun normalizePublicationPath(rawHref: String): String {
        val decoded = decodeHrefPath(rawHref)
        val segments = mutableListOf<String>()
        decoded.replace('\\', '/').split('/').forEach { segment ->
            when (segment) {
                "", "." -> Unit
                ".." -> if (segments.isNotEmpty()) segments.removeAt(segments.lastIndex)
                else -> segments += segment
            }
        }
        return segments.joinToString("/")
    }

    private fun decodeHrefPath(rawHref: String): String {
        val path = rawHref.substringBefore('#').substringBefore('?').trim().trimStart('/')
        return runCatching { URLDecoder.decode(path.replace("+", "%2B"), Charsets.UTF_8.name()) }.getOrDefault(path)
    }

    private fun readDocumentTitle(file: File): String? {
        if (!file.isFile) return null
        val document = runCatching { Jsoup.parse(decodeWithDetectedCharset(file.readBytes())) }.getOrNull() ?: return null
        return sequenceOf(
            document.selectFirst("h1")?.text(),
            document.selectFirst("h2")?.text(),
            document.title(),
        ).mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
            .firstOrNull()
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

/**
 * EpubProcessorWrapper
 *
 * A wrapper for epub.js that abstracts away its complexity
 * and provides a simple interface for the reader.
 */
export class EpubProcessorWrapper {
    constructor() {
        this.processor      = null;
        this.isReady        = false;
        this.metadata       = null;
        this.totalChapters  = 0;
    }

    /**
     * Load a book from its ArrayBuffer content.
     * Returns true on success, false on error.
     */
    async loadBook(bookBinaryContent) {
        try {

            if (!(bookBinaryContent instanceof ArrayBuffer) || bookBinaryContent.byteLength < 512) {
                console.error(`[EpubProcessor] Aborting: Book binary is too small or invalid (${bookBinaryContent.byteLength} bytes)`);
                throw new Error('Invalid or empty book data');
            }

            this.processor = this._createProcessor(bookBinaryContent);
            await this.processor.ensureReady();      // wait for internal init

            this.metadata       = await this.processor.getMetadata();
            this.totalChapters  = await this.processor.getTotalChapters();
            this.isReady        = true;
            return true;
        } catch (err) {
            console.error('EpubProcessorWrapper: Error loading book:', err);
            this.isReady = false;
            return false;
        }
    }

    getBookTitle() {
        return this.isReady && this.metadata?.title ? this.metadata.title : 'Untitled Book';
    }
    getTotalChapters() { return this.totalChapters; }

    async getIndexFromCfi(cfi) {
        if (!this.isReady || !this.processor) return -1;
        try {
            return await this.processor.getIndexFromCfi(cfi);
        } catch (err) {
            console.warn('EpubProcessorWrapper: Error resolving CFI:', err);
            return -1;
        }
    }

    /**
     * Return processed HTML for one chapter (body innerHTML).
     */
    async getChapterHtml(index) {
        if (!this.isReady || !this.processor) {
            console.error('EpubProcessorWrapper: Not ready for getChapterHtml');
            return null;
        }
        if (index < 0 || index >= this.totalChapters) {
            console.error('EpubProcessorWrapper: Invalid chapter index:', index);
            return null;
        }
        try {
            return await this.processor.getChapterHtml(index);
        } catch (err) {
            console.error(`EpubProcessorWrapper: Error getting chapter ${index}:`, err);
            return null;
        }
    }

    /**
     * Fetch the cover image as a Blob (or null if not present).
     */
    async getCoverBlob() {
        if (!this.isReady || !this.processor) {
            console.error('EpubProcessorWrapper: Not ready for getCoverBlob');
            return null;
        }
        try {
            const coverPathOrUrl = await this.processor.book.coverUrl();
            if (!coverPathOrUrl) return null;

            if (coverPathOrUrl.startsWith('blob:')) {
                const res = await fetch(coverPathOrUrl);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                return await res.blob();
            } else {
                return await this.processor.book.archive.request(coverPathOrUrl, 'blob');
            }
        } catch (err) {
            console.error('EpubProcessorWrapper: Error getting cover:', err);
            return null;
        }
    }

    async getChapterTitles() {
        if (!this.isReady || !this.processor) return [];
        try {
            return await this.processor.getChapterTitles();
        } catch (err) {
            console.error('EpubProcessorWrapper: Error getting chapter titles:', err);
            return [];
        }
    }

    _createProcessor(epubDataBuffer) { return new EpubProcessor(epubDataBuffer); }
}


/* ------------------------------------------------------------------
 *  Helper: dynamically load <script src="…"> once per page
 * ------------------------------------------------------------------ */
function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) {
            resolve();      // already present / loading
            return;
        }
        const s   = document.createElement('script');
        s.src     = url;
        s.async   = true;
        s.onload  = () => resolve();
        s.onerror = err => {
            document.head.removeChild(s);
            reject(new Error(`Failed to load script: ${url}`));
        };
        document.head.appendChild(s);
    });
}


/* ------------------------------------------------------------------
 *  Internal EpubProcessor  –  uses epub.js directly
 * ------------------------------------------------------------------ */
class EpubProcessor {
    constructor(epubDataBuffer) {
        if (!(epubDataBuffer instanceof ArrayBuffer)) {
            throw new Error('EpubProcessor (internal) requires an ArrayBuffer.');
        }

        this.book               = null;
        this.isReady            = false;
        this.epubJsLib          = null;
        this.jszip              = null;
        this.dependenciesLoaded = false;
        this.loadingPromise     = null;

        this.readyPromise = this._initialize(epubDataBuffer);
    }

    /* --------- load JSZip + epub.js dynamically if needed --------- */
    async _ensureDependencies() {
        if (this.dependenciesLoaded) return true;
        if (this.loadingPromise)     return this.loadingPromise;

        // already present?
        if (window.JSZip && window.ePub) {
            this.jszip       = window.JSZip;
            this.epubJsLib   = window.ePub;
            this.dependenciesLoaded = true;
            return true;
        }

        const jszipUrl  = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        const epubjsUrl = 'https://unpkg.com/epubjs@0.3.93/dist/epub.min.js';

        this.loadingPromise = (async () => {
            await loadScript(jszipUrl);
            if (!window.JSZip) throw new Error('JSZip failed to load.');
            this.jszip = window.JSZip;

            await loadScript(epubjsUrl);
            if (!window.ePub) throw new Error('epub.js failed to load.');
            this.epubJsLib = window.ePub;

            this.dependenciesLoaded = true;
            this.loadingPromise     = null;
            return true;
        })();

        return this.loadingPromise;
    }

    /* ---------- init book with automatic blob URL replacements ---------- */
    async _initialize(epubDataBuffer) {
        await this._ensureDependencies();

        this.book = this.epubJsLib(epubDataBuffer, { replacements: 'blobUrl' });
        await this.book.ready;

        if (!this.book.spine?.spineItems?.length) {
            throw new Error('EPUB parsing failed – empty spine.');
        }
        this.isReady = true;
    }

    async ensureReady() {
        if (!this.isReady) await this.readyPromise;
        if (!this.isReady)  throw new Error('EpubProcessor (internal) could not be initialized.');
    }

    /* ============================================================
     *  Fast chapter renderer – fulfils the wrapper contract
     * ========================================================== */
    async getChapterHtml(index) {
        await this.ensureReady();

        const spineItem = this.book.spine.get(index);
        if (!spineItem) {
            console.error('EpubProcessor (internal): Invalid chapter index:', index);
            return null;
        }

        try {
            /* 1️⃣ render() auto-rewrites asset URLs to blob: */
            const rawHtml = await spineItem.render(this.book.load.bind(this.book));

            /* 2️⃣ strip scripts + external styles */
            const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
            this._stripScriptsAndStyles(doc);

            /* 3️⃣ return body.innerHTML or fallback documentElement */
            if (doc.body && doc.body.innerHTML.trim()) {
                return doc.body.innerHTML;
            }
            return doc.documentElement ? doc.documentElement.innerHTML : '';
        } catch (err) {
            console.error(`EpubProcessor (internal): Error processing chapter ${index}:`, err);
            return null;
        }
    }

    /* ---- helper: remove <script> and <link rel="stylesheet"> ---- */
    _stripScriptsAndStyles(doc) {
        doc.querySelectorAll('script, link[rel="stylesheet"]').forEach(el => el.remove());
    }

    /* -------- metadata / helper methods -------- */
    async getTotalChapters() { await this.ensureReady(); return this.book.spine.spineItems.length; }
    async getMetadata()      { await this.ensureReady(); return this.book.packaging?.metadata || {}; }

    async getIndexFromCfi(cfi) {
        await this.ensureReady();
        try {
            const item = this.book.spine.get(cfi);
            return item ? item.index : -1;
        } catch {
            return -1;
        }
    }

    async getChapterTitles() {
        await this.ensureReady();

        try {
            /* prefer nav/toc when available */
            if (this.book.navigation?.toc?.length) {
                return this.book.navigation.toc.map((navItem, idx) => {
                    let index = idx;
                    if (navItem.href) {
                        const item = this.book.spine.get(navItem.href);
                        if (item) index = item.index;
                    }
                    return {
                        index,
                        title: navItem.label || `Chapter ${idx + 1}`,
                        href : navItem.href  || ''
                    };
                });
            }

            /* fallback to spine filenames */
            return this.book.spine.spineItems.map((item, idx) => {
                let title = '';
                if (item.idref) {
                    title = item.idref.replace(/[_-]/g, ' ');
                } else if (item.href) {
                    title = item.href.split('/').pop().split('.')[0].replace(/[_-]/g, ' ');
                }
                title = title
                    ? title.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                    : `Chapter ${idx + 1}`;

                return { index: idx, title, href: item.href || '' };
            });
        } catch (err) {
            console.error('EpubProcessor (internal): Error getting chapter titles:', err);
            /* bare fallback */
            return Array.from({ length: this.book.spine.spineItems.length }, (_, i) => ({
                index: i, title: `Chapter ${i + 1}`, href: ''
            }));
        }
    }
}

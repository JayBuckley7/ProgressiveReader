export class TextProcessorWrapper {
    constructor() {
        this.processor     = null;
        this.isReady       = false;
        this.totalChapters = 0;
        this.pageCount     = null;
    }

    async loadBook(blob, options = {}) {
        try {
            const arrayBuffer = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
            this.processor = new TextProcessor(arrayBuffer, options.fileType || 'txt');
            await this.processor.ensureReady();
            this.totalChapters = this.processor.getTotalChapters();
            this.pageCount = this.processor.getOriginalPageCount();
            this.isReady = true;
            return true;
        } catch (err) {
            console.error('TextProcessorWrapper: Error loading book:', err);
            this.isReady = false;
            return false;
        }
    }

    getTotalChapters() { return this.totalChapters; }

    getPageCount() {
        if (!this.isReady || !this.processor) return null;
        return this.pageCount;
    }

    async getChapterHtml(index) {
        if (!this.isReady || !this.processor) return null;
        return this.processor.getChapterHtml(index);
    }

    async getChapterTitles() {
        if (!this.isReady || !this.processor) return [];
        return this.processor.getChapterTitles();
    }
}

function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) {
            resolve();
            return;
        }
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = err => {
            document.head.removeChild(s);
            reject(new Error(`Failed to load script: ${url}`));
        };
        document.head.appendChild(s);
    });
}

class TextProcessor {
    constructor(arrayBuffer, fileType) {
        this.arrayBuffer = arrayBuffer;
        this.fileType = fileType;
        this.chapters = [];
        this.isReady = false;
        this.jszip = null;
        this.dependenciesLoaded = false;
        this.pageCount = null;
        this.readyPromise = this._initialize();
    }

    async ensureReady() {
        if (!this.isReady) await this.readyPromise;
        if (!this.isReady) throw new Error('TextProcessor failed to initialize');
    }

    async _ensureJsZip() {
        if (this.dependenciesLoaded) return true;
        if (window.JSZip) {
            this.jszip = window.JSZip;
            this.dependenciesLoaded = true;
            return true;
        }
        const jszipUrl = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        await loadScript(jszipUrl);
        if (!window.JSZip) throw new Error('JSZip failed to load');
        this.jszip = window.JSZip;
        this.dependenciesLoaded = true;
        return true;
    }

    async _initialize() {
        let text = '';
        if (this.fileType === 'docx') {
            text = await this._extractDocxText();
        } else {
            const blob = new Blob([this.arrayBuffer]);
            text = await blob.text();
        }
        this._splitIntoChapters(text);
        this.isReady = true;
    }

    async _extractDocxText() {
        await this._ensureJsZip();
        const zip = await this.jszip.loadAsync(this.arrayBuffer);
        const docXml = await zip.file('word/document.xml').async('text');
        const parser = new DOMParser();
        const doc = parser.parseFromString(docXml, 'application/xml');
        const texts = Array.from(doc.getElementsByTagName('w:t')).map(el => el.textContent);
        this.pageCount = await this._getDocxPageCount(zip).catch(() => null);
        return texts.join(' ');
    }

    async _getDocxPageCount(zip) {
        const appEntry = zip.file('docProps/app.xml');
        if (!appEntry) return null;
        const appXml = await appEntry.async('text');
        const parser = new DOMParser();
        const doc = parser.parseFromString(appXml, 'application/xml');
        const pagesEl = doc.getElementsByTagName('Pages')[0];
        const count = pagesEl ? parseInt(pagesEl.textContent, 10) : null;
        return isNaN(count) ? null : count;
    }

    _splitIntoChapters(text) {
        const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p);
        const chapters = [];
        let current = [];
        let wordCount = 0;

        const push = () => {
            if (current.length) {
                chapters.push(current.join('\n\n'));
                current = [];
                wordCount = 0;
            }
        };

        for (const para of paragraphs) {
            const words = para.split(/\s+/);
            if (wordCount + words.length > 6000) {
                push();
            }
            current.push(para);
            wordCount += words.length;
            if (wordCount >= 4000) {
                push();
            }
        }
        if (current.length) push();
        this.chapters = chapters;
    }

    getTotalChapters() { return this.chapters.length; }

    getOriginalPageCount() {
        return this.pageCount;
    }

    getChapterHtml(index) {
        if (index < 0 || index >= this.chapters.length) return null;
        const paragraphs = this.chapters[index].split(/\n\n/).map(p => {
            return p
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        });
        return '<p>' + paragraphs.join('</p><p>') + '</p>';
    }

    getChapterTitles() {
        return this.chapters.map((_, i) => ({ index: i, title: `Part ${i + 1}`, href: '' }));
    }
}

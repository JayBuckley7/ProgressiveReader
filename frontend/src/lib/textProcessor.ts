export interface ChapterTitle {
  index: number;
  title: string;
}

/**
 * Placeholder implementation for basic text file processing.
 */
export class TextProcessorWrapper {
  processor: TextProcessor | null;
  isReady: boolean;
  totalChapters: number;
  pageCount: number;

  constructor() {
    this.processor     = null;
    this.isReady       = false;
    this.totalChapters = 0;
    this.pageCount     = 0;
  }

  async loadBook(blob: ArrayBuffer | Blob, options: { fileType?: string } = {}): Promise<boolean> {
    try {
      const arrayBuffer = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer();
      this.processor = new TextProcessor(arrayBuffer, options.fileType || 'txt');
      await this.processor.ensureReady();
      this.totalChapters = this.processor.getTotalChapters();
      this.pageCount     = this.processor.pageCount || this.totalChapters;
      this.isReady = true;
      return true;
    } catch (err) {
      console.error('TextProcessorWrapper: Error loading book:', err);
      this.isReady = false;
      return false;
    }
  }

  getTotalChapters(): number {
    return this.totalChapters;
  }

  getPageCount(): number {
    return this.pageCount;
  }

  async getChapterTitles(): Promise<{ index: number, title: string }[]> {
    if (!this.isReady || !this.processor) return [];
    return this.processor.getChapterTitles();
  }

  async getChapterHtml(index: number): Promise<string | null> {
    if (!this.isReady || !this.processor) return null;
    return this.processor.getChapterHtml(index);
  }
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      document.head.removeChild(s);
      reject(new Error(`Failed to load script: ${url}`));
    };
    document.head.appendChild(s);
  });
}

class TextProcessor {
  arrayBuffer: ArrayBuffer;
  fileType: string;
  chapters: any[];
  isReady: boolean;
  pageCount: number;
  jszip: any | null;
  dependenciesLoaded: boolean;
  readyPromise: Promise<void>;

  constructor(arrayBuffer: ArrayBuffer, fileType: string) {
    this.arrayBuffer = arrayBuffer;
    this.fileType = fileType;
    this.chapters = [];
    this.isReady = false;
    this.pageCount = 0;
    this.jszip = null;
    this.dependenciesLoaded = false;
    this.readyPromise = this._initialize();
  }

  async ensureReady(): Promise<void> {
    if (!this.isReady) await this.readyPromise;
    if (!this.isReady) throw new Error('TextProcessor failed to initialize');
  }

  async _ensureJsZip(): Promise<boolean> {
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

  async _ensurePdfJs(): Promise<boolean> {
    if (window.pdfjsLib) return true;
    const pdfjsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    await loadScript(pdfjsUrl);
    if (!window.pdfjsLib) throw new Error('pdf.js failed to load');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    return true;
  }

  async _initialize(): Promise<void> {
    let paragraphs: { text: string, style?: any, pageBreak?: boolean }[] = [];
    if (this.fileType === 'docx') {
      paragraphs = await this._extractDocxParagraphs();
    } else if (this.fileType === 'pdf') {
      paragraphs = await this._extractPdfParagraphs();
    } else {
      const blob = new Blob([this.arrayBuffer]);
      const text = await blob.text();
      paragraphs = text.split(/\\n\\s*\\n/).map(p => ({ text: p.trim() })).filter(p => p.text);
    }
    this._splitIntoChapters(paragraphs);
    this.isReady = true;
  }

  async _extractDocxParagraphs(): Promise<{ text: string, style?: any, pageBreak?: boolean }[]> {
    await this._ensureJsZip();
    const zip = await this.jszip.loadAsync(this.arrayBuffer);
    const docXml = await zip.file('word/document.xml').async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(docXml, 'application/xml');

    const paragraphs: { text: string, style?: any, pageBreak?: boolean }[] = [];
    let pageCount = 1;
    const pElements = Array.from(doc.getElementsByTagName('w:p'));
    for (const p of pElements) {
      let pageBreak = false;
      if (p.getElementsByTagName('w:lastRenderedPageBreak').length) {
        pageBreak = true;
      }
      const brs = Array.from(p.getElementsByTagName('w:br'));
      if (brs.some(br => br.getAttribute('w:type') === 'page')) {
        pageBreak = true;
      }

      const textNodes = Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent);
      const text = textNodes.join('');
      if (!text.trim()) continue;

      const style: any = {};
      const rPr = p.getElementsByTagName('w:rPr')[0];
      if (rPr) {
        const szEl = rPr.getElementsByTagName('w:sz')[0];
        if (szEl) {
          const val = parseInt(szEl.getAttribute('w:val'), 10);
          if (!isNaN(val)) style.fontSize = ((val / 2) * 1.333).toFixed(2) + 'px';
        }
      }
      const pPr = p.getElementsByTagName('w:pPr')[0];
      if (pPr) {
        const spacing = pPr.getElementsByTagName('w:spacing')[0];
        if (spacing) {
          const before = spacing.getAttribute('w:before');
          const after = spacing.getAttribute('w:after');
          const line = spacing.getAttribute('w:line');
          if (before) {
            const v = parseInt(before, 10);
            if (!isNaN(v)) style.marginTop = ((v / 20) * 1.333).toFixed(2) + 'px';
          }
          if (after) {
            const v = parseInt(after, 10);
            if (!isNaN(v)) style.marginBottom = ((v / 20) * 1.333).toFixed(2) + 'px';
          }
          if (line) {
            const v = parseInt(line, 10);
            if (!isNaN(v)) style.lineHeight = ((v / 20) * 1.333).toFixed(2) + 'px';
          }
        }
      }

      paragraphs.push({ text, style, pageBreak });
      if (pageBreak) pageCount += 1;
    }
    this.pageCount = pageCount;
    return paragraphs;
  }

  async _extractPdfParagraphs(): Promise<{ text: string, style?: any, pageBreak?: boolean }[]> {
    await this._ensurePdfJs();
    const loadingTask = window.pdfjsLib.getDocument({ data: this.arrayBuffer });
    const pdf = await loadingTask.promise;
    const paragraphs: { text: string, style?: any, pageBreak?: boolean }[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((it: any) => it.str).join(' ').trim();
      const sizes = textContent.items.map((it: any) => Math.abs(it.transform[0])).filter((n: number) => !isNaN(n));
      const style: any = {};
      if (sizes.length) {
        const avg = sizes.reduce((a: number, b: number) => a + b, 0) / sizes.length;
        style.fontSize = avg.toFixed(2) + 'px';
      }
      paragraphs.push({ text, style, pageBreak: pageNum > 1 });
    }
    this.pageCount = pdf.numPages;
    return paragraphs;
  }

  _splitIntoChapters(paragraphs: { text: string, style?: any, pageBreak?: boolean }[]): void {
    const chapters: any[] = [];
    let current: { text: string, style?: any, pageBreak?: boolean }[] = [];
    let wordCount = 0;

    const push = () => {
      if (current.length) {
        chapters.push(current);
        current = [];
        wordCount = 0;
      }
    };

    for (const para of paragraphs) {
      const words = para.text.split(/\\s+/);
      if (para.pageBreak && current.length) {
        push();
      }
      if (wordCount + words.length > 6000) {
        push();
      }
      current.push(para);
      wordCount += words.length;
      if (para.pageBreak) {
        push();
        continue;
      }
      if (wordCount >= 4000) {
        push();
      }
    }
    if (current.length) push();
    this.chapters = chapters;
  }

  getTotalChapters(): number {
    return this.chapters.length;
  }

  getChapterHtml(index: number): string | null {
    if (index < 0 || index >= this.chapters.length) return null;
    const paras = this.chapters[index];
    const esc = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = '';
    for (const p of paras) {
      if (p.pageBreak) html += '<div class="page-break"></div>';
      const styles = [];
      if (p.style) {
        if (p.style.fontSize) styles.push(`font-size:${p.style.fontSize}`);
        if (p.style.lineHeight) styles.push(`line-height:${p.style.lineHeight}`);
        if (p.style.marginTop) styles.push(`margin-top:${p.style.marginTop}`);
        if (p.style.marginBottom) styles.push(`margin-bottom:${p.style.marginBottom}`);
      }
      const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
      html += `<p${styleAttr}>${esc(p.text)}</p>`;
    }
    return html;
  }

  getChapterTitles(): { index: number, title: string }[] {
    return this.chapters.map((_, index) => ({
      index: index,
      title: `Chapter ${index + 1}`
    }));
  }
}

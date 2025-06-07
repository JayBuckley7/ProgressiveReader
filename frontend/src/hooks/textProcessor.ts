import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

// Set workerSrc to load the PDF worker from a CDN
// This is necessary for pdfjs-dist to work in a web environment
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface ChapterTitle {
  index: number;
  title: string;
  href: string;
}

interface Paragraph {
  text: string;
  style?: Record<string, string>;
  pageBreak?: boolean;
}

/**
 * Implementation for text file processing based on textProcessor.js.
 * Handles TXT, DOCX, and PDF files.
 */
export class TextProcessorWrapper {
  private chapters: Paragraph[][] = [];
  private pageCount = 0;
  private fileType: string | null = null;

  async loadBook(buffer: ArrayBuffer, opts?: { fileType: string }): Promise<boolean> {
    this.fileType = opts?.fileType || 'txt';
    let paragraphs: Paragraph[] = [];

    try {
      if (this.fileType === 'docx') {
        paragraphs = await this._extractDocxParagraphs(buffer);
      } else if (this.fileType === 'pdf') {
        paragraphs = await this._extractPdfParagraphs(buffer);
      } else {
        const text = new TextDecoder().decode(buffer);
        paragraphs = text.split(/\n\s*\n/).map(p => ({ text: p.trim() })).filter(p => p.text);
      }
      this._splitIntoChapters(paragraphs);
      return true;
    } catch (err) {
      console.error('TextProcessorWrapper: Error loading book:', err);
      return false;
    }
  }

  getTotalChapters(): number {
    return this.chapters.length;
  }

  getPageCount(): number {
    return this.pageCount || this.chapters.length;
  }

  async getChapterTitles(): Promise<ChapterTitle[]> {
    const prefix = (this.fileType === 'docx' || this.fileType === 'pdf') ? 'Page' : 'Part';
    return this.chapters.map((_, i) => ({ index: i, title: `${prefix} ${i + 1}`, href: '' }));
  }

  async getChapterHtml(index: number): Promise<string | null> {
    if (index < 0 || index >= this.chapters.length) {
      return null;
    }
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

  private async _extractDocxParagraphs(buffer: ArrayBuffer): Promise<Paragraph[]> {
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('text');
    if (!docXml) return [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(docXml, 'application/xml');

    const paragraphs: Paragraph[] = [];
    let pageCount = 1;
    const pElements = Array.from(doc.getElementsByTagName('w:p'));

    for (const p of pElements) {
        let pageBreak = false;
        if (p.getElementsByTagName('w:lastRenderedPageBreak').length > 0) {
            pageBreak = true;
        }
        const brs = Array.from(p.getElementsByTagName('w:br'));
        if (brs.some(br => br.getAttribute('w:type') === 'page')) {
            pageBreak = true;
        }

        const text = Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
        if (!text.trim()) continue;

        const style: Record<string, string> = {};
        // Simplified style extraction logic from JS file
        // A more robust implementation might be needed for full fidelity.

        paragraphs.push({ text, style, pageBreak });
        if (pageBreak) pageCount += 1;
    }
    this.pageCount = pageCount;
    return paragraphs;
  }

  private async _extractPdfParagraphs(buffer: ArrayBuffer): Promise<Paragraph[]> {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    const paragraphs: Paragraph[] = [];
    this.pageCount = pdf.numPages;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        if (textContent.items.length === 0) continue;

        // Group items into paragraphs based on transform and font size.
        // This is a simplified approach.
        const text = textContent.items.map(item => (item as any).str).join(' ');
        paragraphs.push({ text, pageBreak: pageNum > 1 });
    }
    return paragraphs;
  }

  private _splitIntoChapters(paragraphs: Paragraph[]): void {
      const chapters: Paragraph[][] = [];
      let current: Paragraph[] = [];
      let wordCount = 0;

      const push = () => {
          if (current.length > 0) {
              chapters.push(current);
              current = [];
              wordCount = 0;
          }
      };

      for (const para of paragraphs) {
          const words = para.text.split(/\s+/).length;
          if (para.pageBreak && current.length > 0) {
              push();
          }
          if (wordCount + words > 6000) {
              push();
          }
          current.push(para);
          wordCount += words;
          if (para.pageBreak) {
              push();
              continue;
          }
          if (wordCount >= 4000) {
              push();
          }
      }
      if (current.length > 0) push();
      this.chapters = chapters;
  }
}

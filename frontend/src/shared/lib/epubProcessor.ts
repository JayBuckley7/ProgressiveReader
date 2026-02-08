import { appLog } from '@shared/appLog';
import JSZip from 'jszip';

export interface ChapterTitle {
  index: number;
  label: string;
  href: string;
}

type TocItem = {
  label: string;
  href: string;
  subitems?: TocItem[];
  [key: string]: any;
};

let epubLibPromise: Promise<any> | null = null;

async function loadEpubJs(): Promise<any> {
  if (!epubLibPromise) {
    epubLibPromise = (async () => {
      // Many epub.js builds assume JSZip is available on window.
      (window as any).JSZip = JSZip;
      const mod = await import('epubjs');
      return (mod as any).default ?? mod;
    })();
  }
  return epubLibPromise;
}

// Wrapper around epub.js, used by the reader and upload flows.
export class EpubProcessorWrapper {
  processor: EpubProcessor | null;
  isReady: boolean;
  metadata: any | null;
  totalChapters: number;

  constructor() {
    this.processor = null;
    this.isReady = false;
    this.metadata = null;
    this.totalChapters = 0;
  }

  async loadBook(bookBinaryContent: ArrayBuffer): Promise<boolean> {
    try {
      if (!(bookBinaryContent instanceof ArrayBuffer) || bookBinaryContent.byteLength < 512) {
        appLog.error(
          `[EpubProcessor] Aborting: Book binary is too small or invalid (${bookBinaryContent.byteLength} bytes)`
        );
        throw new Error('Invalid or empty book data');
      }

      this.processor = new EpubProcessor(bookBinaryContent);
      await this.processor.ensureReady();

      this.metadata = await this.processor.getMetadata();
      this.totalChapters = await this.processor.getTotalChapters();
      this.isReady = true;
      return true;
    } catch (err) {
      appLog.error('EpubProcessorWrapper: Error loading book:', err);
      this.isReady = false;
      return false;
    }
  }

  getBookTitle(): string {
    return this.isReady && this.metadata?.title ? this.metadata.title : 'Untitled Book';
  }

  getTotalChapters(): number {
    return this.totalChapters;
  }

  async getIndexFromCfi(cfi: string): Promise<number> {
    if (!this.isReady || !this.processor) return -1;
    try {
      return await this.processor.getIndexFromCfi(cfi);
    } catch (err) {
      appLog.warn('EpubProcessorWrapper: Error resolving CFI:', err);
      return -1;
    }
  }

  async getChapterHtml(index: number): Promise<string | null> {
    if (!this.isReady || !this.processor) {
      appLog.error('EpubProcessorWrapper: Not ready for getChapterHtml');
      return null;
    }
    if (index < 0 || index >= this.totalChapters) {
      appLog.error('EpubProcessorWrapper: Invalid chapter index:', index);
      return null;
    }
    try {
      return await this.processor.getChapterHtml(index);
    } catch (err) {
      appLog.error(`EpubProcessorWrapper: Error getting chapter ${index}:`, err);
      return null;
    }
  }

  async getCoverBlob(): Promise<Blob | null> {
    if (!this.isReady || !this.processor) {
      appLog.error('EpubProcessorWrapper: Not ready for getCoverBlob');
      return null;
    }
    try {
      const coverPathOrUrl = await this.processor.book.coverUrl();
      if (!coverPathOrUrl) return null;

      if (coverPathOrUrl.startsWith('blob:')) {
        const res = await fetch(coverPathOrUrl);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.blob();
      }
      return await this.processor.book.archive.request(coverPathOrUrl, 'blob');
    } catch (err) {
      appLog.error('EpubProcessorWrapper: Error getting cover:', err);
      return null;
    }
  }

  async getChapterTitles(): Promise<ChapterTitle[]> {
    if (!this.isReady || !this.processor) return [];
    try {
      return await this.processor.getChapterTitles();
    } catch (err) {
      appLog.error('EpubProcessorWrapper: Error getting chapter titles:', err);
      return [];
    }
  }
}

class EpubProcessor {
  book: any | null;
  isReady: boolean;
  readyPromise: Promise<void>;

  constructor(epubDataBuffer: ArrayBuffer) {
    if (!(epubDataBuffer instanceof ArrayBuffer)) {
      throw new Error('EpubProcessor (internal) requires an ArrayBuffer.');
    }

    this.book = null;
    this.isReady = false;
    this.readyPromise = this._initialize(epubDataBuffer);
  }

  private async _initialize(epubDataBuffer: ArrayBuffer): Promise<void> {
    const epubJs = await loadEpubJs();

    this.book = epubJs(epubDataBuffer, { replacements: 'blobUrl' });
    await this.book.ready;

    const hasToc = Array.isArray(this.book.navigation?.toc) && this.book.navigation.toc.length > 0;
    if (!hasToc && Array.isArray(this.book.spine?.spineItems)) {
      const syntheticToc: TocItem[] = [];
      for (const item of this.book.spine.spineItems) {
        if (item.linear && item.linear === 'no') continue;
        syntheticToc.push({ label: item.idref, href: item.href });
      }
      if (!this.book.navigation) this.book.navigation = { toc: syntheticToc };
      else this.book.navigation.toc = syntheticToc;
    }

    if (!this.book.spine?.spineItems?.length) {
      throw new Error('EPUB parsing failed: empty spine.');
    }

    this.isReady = true;
  }

  async ensureReady(): Promise<void> {
    if (!this.isReady) await this.readyPromise;
    if (!this.isReady) throw new Error('EpubProcessor (internal) could not be initialized.');
  }

  async getChapterHtml(index: number): Promise<string | null> {
    await this.ensureReady();

    const flatToc = this.book.navigation?.toc ? this._flattenToc(this.book.navigation.toc) : [];
    const total = flatToc.length || this.book.spine?.spineItems?.length || 0;

    if (index < 0 || index >= total) {
      appLog.error('EpubProcessor (internal): Chapter index out of bounds:', index);
      return null;
    }

    const tocItem = flatToc[index] || this.book.navigation?.toc?.[index];
    if (!tocItem) {
      appLog.error('EpubProcessor (internal): Invalid chapter index:', index);
      return null;
    }

    let spineItem = this.book.spine.get(tocItem.href);
    if (!spineItem) {
      appLog.warn(
        'EpubProcessor (internal): Spine lookup by href failed, falling back to index for href:',
        tocItem.href
      );
      spineItem = this.book.spine.get(index);
    }
    if (!spineItem) {
      appLog.error(
        'EpubProcessor (internal): Could not find spine item for href or index:',
        tocItem.href,
        index
      );
      return null;
    }

    try {
      const rawHtml = await spineItem.render(this.book.load.bind(this.book));
      const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
      this._stripScriptsAndStyles(doc);

      if (doc.body && doc.body.innerHTML.trim()) return doc.body.innerHTML;
      return doc.documentElement ? doc.documentElement.innerHTML : '';
    } catch (err) {
      appLog.error(`EpubProcessor (internal): Error processing chapter ${index}:`, err);
      return null;
    }
  }

  private _stripScriptsAndStyles(doc: Document): void {
    doc.querySelectorAll('script, link[rel="stylesheet"], style').forEach((el) => el.remove());
  }

  private _flattenToc(toc: TocItem[]): TocItem[] {
    const flat: TocItem[] = [];
    const walk = (items: TocItem[]): void => {
      for (const item of items) {
        flat.push(item);
        if (item.subitems && Array.isArray(item.subitems)) walk(item.subitems);
      }
    };
    walk(toc);
    return flat;
  }

  async getTotalChapters(): Promise<number> {
    await this.ensureReady();
    if (!this.book.navigation?.toc) return 0;
    return this._flattenToc(this.book.navigation.toc).length;
  }

  async getMetadata(): Promise<any> {
    await this.ensureReady();
    return this.book.packaging?.metadata || {};
  }

  async getIndexFromCfi(cfi: string): Promise<number> {
    await this.ensureReady();
    try {
      const item = this.book.spine.get(cfi);
      if (!item) return -1;
      return item.index;
    } catch (err) {
      appLog.warn('EpubProcessor (internal): Error resolving CFI:', err);
      return -1;
    }
  }

  async getChapterTitles(): Promise<ChapterTitle[]> {
    await this.ensureReady();
    try {
      if (!this.book.navigation?.toc) return [];
      const flat = this._flattenToc(this.book.navigation.toc);
      return flat.map((item, index) => ({
        index,
        label: String(item.label || '').trim(),
        href: item.href,
      }));
    } catch (err) {
      appLog.error('EpubProcessor (internal): Error getting chapter titles:', err);
      return [];
    }
  }
}


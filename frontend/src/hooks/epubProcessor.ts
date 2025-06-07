import ePub, { Book, Rendition } from 'epubjs';

export interface ChapterTitle {
  index: number;
  title: string;
  href: string;
}

/**
 * Wrapper for epub.js to provide a consistent interface for EPUB processing.
 */
export class EpubProcessorWrapper {
  private book: Book | null = null;
  private isReady = false;
  private metadata: any = null;
  private navigation: any = null;

  async loadBook(buffer: ArrayBuffer): Promise<boolean> {
    try {
      this.book = ePub(buffer, { replacements: 'blobUrl' });
      await this.book.ready;
      this.metadata = await this.book.loaded.metadata;
      this.navigation = await this.book.loaded.navigation;
      this.isReady = true;
      return true;
    } catch (err) {
      console.error('EpubProcessorWrapper: Error loading book:', err);
      this.isReady = false;
      return false;
    }
  }

  getMetadata(): Record<string, unknown> {
    return this.metadata || {};
  }

  getBookTitle(): string {
    return this.isReady && this.metadata?.title ? this.metadata.title : 'Untitled Book';
  }

  getTotalChapters(): number {
    return (this.book?.spine as any)?.items.length || 0;
  }

  async getChapterTitles(): Promise<ChapterTitle[]> {
    if (!this.isReady || !this.book) return [];

    try {
      if (this.navigation?.toc?.length) {
        return this.navigation.toc.map((navItem: any, idx: number) => {
          let index = idx;
          if (navItem.href) {
            const item = this.book!.spine.get(navItem.href);
            if (item) index = item.index;
          }
          return {
            index,
            title: navItem.label || `Chapter ${idx + 1}`,
            href: navItem.href || ''
          };
        });
      }

      return (this.book.spine as any).items.map((item: any, idx: number) => ({
        index: idx,
        title: item.idref || `Chapter ${idx + 1}`,
        href: item.href || ''
      }));
    } catch (err) {
      console.error('EpubProcessorWrapper: Error getting chapter titles:', err);
      return [];
    }
  }

  async getChapterHtml(index: number): Promise<string | null> {
    if (!this.isReady || !this.book) {
      return null;
    }
    try {
      const section = this.book.spine.get(index);
      if (!section) return null;

      const rendition = this.book.renderTo(document.createElement('div'));
      const displayed = await rendition.display(section.href);
      const contents = await (displayed as any).contents.innerHTML;
      
      // We need to destroy the rendition to avoid memory leaks
      rendition.destroy();
      
      return contents;

    } catch (err) {
      console.error(`EpubProcessorWrapper: Error getting chapter ${index}:`, err);
      return null;
    }
  }

  async getCoverBlob(): Promise<Blob | null> {
    if (!this.isReady || !this.book) return null;
    try {
        const coverUrl = await this.book.coverUrl();
        if (!coverUrl) return null;

        if (coverUrl.startsWith('blob:')) {
            const res = await fetch(coverUrl);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            return await res.blob();
        } else {
            // In epub.js v0.3, archive is available. Let's assume it is.
            // The types for Book object may not be complete.
            return await (this.book.archive as any).request(coverUrl, 'blob');
        }
    } catch (err) {
        console.error('EpubProcessorWrapper: Error getting cover:', err);
        return null;
    }
  }
}

export interface ChapterTitle {
  index: number;
  title: string;
  href: string;
}

/**
 * Minimal placeholder implementation for EPUB processing.
 * This wrapper exposes the methods used by the application
 * but does not perform real EPUB parsing.
 */
export class EpubProcessorWrapper {
  private data: ArrayBuffer | null = null;

  async loadBook(buffer: ArrayBuffer): Promise<boolean> {
    this.data = buffer;
    return true;
  }

  getMetadata(): Record<string, unknown> {
    return {};
  }

  getTotalChapters(): number {
    return 1;
  }

  async getChapterTitles(): Promise<ChapterTitle[]> {
    return [{ index: 0, title: 'Chapter 1', href: '' }];
  }

  async getChapterHtml(_index: number): Promise<string | null> {
    if (!this.data) {
      return null;
    }
    const text = new TextDecoder().decode(this.data);
    return `<pre>${text}</pre>`;
  }
}

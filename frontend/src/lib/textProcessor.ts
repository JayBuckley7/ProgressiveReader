export interface ChapterTitle {
  index: number;
  title: string;
  href: string;
}

/**
 * Placeholder implementation for basic text file processing.
 */
export class TextProcessorWrapper {
  private chapters: string[] = [];

  async loadBook(buffer: ArrayBuffer, _opts?: {fileType: string}): Promise<boolean> {
    const text = new TextDecoder().decode(buffer);
    this.chapters = text.split(/\n\s*\n/).filter(Boolean);
    if (this.chapters.length === 0) {
      this.chapters = [text];
    }
    return true;
  }

  getTotalChapters(): number {
    return this.chapters.length;
  }

  async getChapterTitles(): Promise<ChapterTitle[]> {
    return this.chapters.map((_, i) => ({ index: i, title: `Part ${i + 1}`, href: '' }));
  }

  async getChapterHtml(index: number): Promise<string | null> {
    if (index < 0 || index >= this.chapters.length) {
      return null;
    }
    return `<p>${this.chapters[index]}</p>`;
  }
}

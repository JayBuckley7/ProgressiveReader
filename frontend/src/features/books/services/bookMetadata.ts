import type { BookMetadata, Folder } from "~/types";
import type { OCRProgressCallback } from "./ocrApi";
import { BookCoverService } from "./bookCovers";
import { BookLibraryService } from "./bookLibraryService";
import { BookCloudDataService } from "./bookCloudData";

/**
 * Facade over book-related services.
 *
 * This file stays as the stable import target (`@features/books/services/bookMetadata`),
 * while implementation details are split into smaller modules.
 */
class BookMetadataService {
  private covers = new BookCoverService();
  private library = new BookLibraryService(this.covers);
  private cloudData = new BookCloudDataService();

  // Covers
  async lookupCover(title: string): Promise<Blob | undefined> {
    return await this.covers.lookupCover(title);
  }

  async getCachedPlaceholderCoverUrl(
    bookId: string,
    title: string,
    fileType?: string,
    author?: string
  ): Promise<string | null> {
    return await this.covers.getCachedPlaceholderCoverUrl(bookId, title, fileType, author);
  }

  async generatePlaceholderCover(title: string, fileType?: string, author?: string): Promise<Blob> {
    return await this.covers.generatePlaceholderCover(title, fileType, author);
  }

  // Library (Drive) operations
  async uploadBook(
    file: File,
    meta: { title: string; fileType: string; cover?: Blob; processOCR?: boolean },
    clerkUser?: any,
    onOCRProgress?: OCRProgressCallback
  ): Promise<BookMetadata> {
    return await this.library.uploadBook(file, meta, clerkUser, onOCRProgress);
  }

  async getUserBooks(onCoverReady?: (bookId: string, coverUrl: string) => void): Promise<BookMetadata[]> {
    return await this.library.getUserBooks(onCoverReady);
  }

  async deleteBook(id: string): Promise<void> {
    await this.library.deleteBook(id);
  }

  async updateBookCover(bookId: string, coverFile: File): Promise<string> {
    return await this.library.updateBookCover(bookId, coverFile);
  }

  async updateBookMetadata(bookId: string, updates: { title?: string; author?: string }): Promise<void> {
    await this.library.updateBookMetadata(bookId, updates);
  }

  async syncBooks(
    clerkUser?: any,
    onCoverReady?: (bookId: string, coverUrl: string) => void
  ): Promise<BookMetadata[]> {
    return await this.library.syncBooks(clerkUser, onCoverReady);
  }

  async openCloudFolder(clerkUser?: any): Promise<void> {
    await this.library.openCloudFolder(clerkUser);
  }

  // Cloud data
  async saveSettings(settings: any): Promise<boolean> {
    return await this.cloudData.saveSettings(settings);
  }

  async loadSettings(): Promise<any | null> {
    return await this.cloudData.loadSettings();
  }

  async saveVocabulary(words: any[]): Promise<void> {
    await this.cloudData.saveVocabulary(words);
  }

  async loadVocabulary(): Promise<any[] | null> {
    return await this.cloudData.loadVocabulary();
  }

  async saveGrammarProgress(knownIds: string[]): Promise<void> {
    await this.cloudData.saveGrammarProgress(knownIds);
  }

  async loadGrammarProgress(): Promise<string[] | null> {
    return await this.cloudData.loadGrammarProgress();
  }

  async saveGrammarStateV2(payload: {
    knownIds: string[];
    learningIds: string[];
    examplesByGrammarId: Record<string, any[]>;
  }): Promise<void> {
    await this.cloudData.saveGrammarStateV2(payload);
  }

  async loadGrammarStateV2(): Promise<{
    knownIds: string[];
    learningIds: string[];
    examplesByGrammarId: Record<string, any[]>;
  } | null> {
    return await this.cloudData.loadGrammarStateV2();
  }

  // Folder management
  async createFolder(name: string, parentId?: string, clerkUser?: any): Promise<Folder> {
    return await this.library.createFolder(name, parentId, clerkUser);
  }

  async updateFolder(
    folderId: string,
    updates: { name?: string; parentId?: string },
    clerkUser?: any
  ): Promise<Folder> {
    return await this.library.updateFolder(folderId, updates, clerkUser);
  }

  async deleteFolder(folderId: string, clerkUser?: any): Promise<void> {
    await this.library.deleteFolder(folderId, clerkUser);
  }

  async getFolders(clerkUser?: any): Promise<Folder[]> {
    return await this.library.getFolders(clerkUser);
  }

  async moveBookToFolder(bookId: string, folderId: string | null, clerkUser?: any): Promise<void> {
    await this.library.moveBookToFolder(bookId, folderId, clerkUser);
  }
}

export const bookMetadataService = new BookMetadataService();


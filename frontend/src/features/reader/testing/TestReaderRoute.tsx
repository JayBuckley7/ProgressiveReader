import { useMemo } from "react";

import { AppDataOverrideProvider, type AppDataContextType } from "@shared/contexts/AppDataContext";
import { BookReader } from "@features/reader/components/BookReader";
import type { BookMetadata, ReadingProgress } from "~/types";

type TestReaderKind = "pdf" | "pdfs" | "epub";

const TEST_USER_ID = "test-reader";

function envString(name: string): string {
  const value = (import.meta.env as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

function testBook(kind: TestReaderKind): { book: BookMetadata; url: string } {
  const now = new Date("2026-04-26T00:00:00.000Z");

  if (kind === "pdf" || kind === "pdfs") {
    const envPrefix = kind === "pdfs" ? "VITE_TEST_READER_PDFS" : "VITE_TEST_READER_PDF";
    const url = envString(`${envPrefix}_URL`) || envString("VITE_TEST_READER_PDF_URL");
    const id = kind === "pdfs" ? "__test_pdfs__" : "__test_pdf__";
    return {
      url,
      book: {
        id,
        title: envString(`${envPrefix}_TITLE`) || envString("VITE_TEST_READER_PDF_TITLE") || "Test PDF",
        author: "ProgressiveReader Test",
        fileType: "pdf",
        driveFileId: `${id}_file`,
        modifiedTime: envString(`${envPrefix}_VERSION`) || envString("VITE_TEST_READER_PDF_VERSION") || "local-test",
        uploadedAt: now,
        userId: TEST_USER_ID,
        cloudProvider: "local",
      },
    };
  }

  const url = envString("VITE_TEST_READER_EPUB_URL") || "/demo_books/%E8%8D%89%E6%9E%95_smol.epub";
  return {
    url,
    book: {
      id: "__test_epub__",
      title: envString("VITE_TEST_READER_EPUB_TITLE") || "Test EPUB",
      author: "ProgressiveReader Test",
      fileType: "epub",
      driveFileId: "__test_epub_file__",
      modifiedTime: envString("VITE_TEST_READER_EPUB_VERSION") || "local-test",
      uploadedAt: now,
      userId: TEST_USER_ID,
      cloudProvider: "local",
    },
  };
}

async function fetchBookBlob(url: string): Promise<Blob> {
  if (!url) {
    throw new Error("Test reader file URL is not configured.");
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load test reader file: ${response.status}`);
  }
  return await response.blob();
}

function createTestReaderData(book: BookMetadata, fileUrl: string): AppDataContextType {
  const progressKey = `reading_progress_${book.id}`;
  const readStoredProgress = (): ReadingProgress | null => {
    const raw = localStorage.getItem(progressKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return { ...parsed, lastUpdated: new Date(parsed.lastUpdated) } as ReadingProgress;
    } catch {
      localStorage.removeItem(progressKey);
      return null;
    }
  };

  return {
    books: [book],
    folders: [],
    isLoading: false,
    isDriveBookLoading: false,
    isAuthenticated: true,
    isDriveConnected: true,
    isTokenNearExpiry: false,
    isRefreshing: false,
    syncBooks: async () => {},
    uploadBook: async () => null,
    downloadBook: async (bookId) => {
      if (bookId !== book.id) return null;
      return await fetchBookBlob(fileUrl);
    },
    deleteBook: async () => {},
    updateBookCover: async () => undefined,
    updateBookMetadata: async () => {},
    openCloudFolder: async () => {},
    createFolder: async () => {},
    updateFolder: async () => {},
    deleteFolder: async () => {},
    moveBookToFolder: async () => {},
    getReadingProgress: async () => readStoredProgress(),
    getReadingProgresses: async (bookIds) => {
      const stored = readStoredProgress();
      return stored && bookIds.includes(book.id) ? { [book.id]: stored } : {};
    },
    saveBookProgress: async (
      bookId,
      currentChapter,
      currentPosition = 0,
      currentPage,
      totalPages,
      fileType,
      scrollHeight,
      viewportHeight
    ) => {
      const progress: ReadingProgress = {
        bookId,
        userId: TEST_USER_ID,
        currentChapter,
        currentPosition,
        currentPage,
        totalPages,
        fileType,
        scrollHeight,
        viewportHeight,
        lastUpdated: new Date(),
      };
      localStorage.setItem(progressKey, JSON.stringify(progress));
    },
    saveSettings: async () => true,
    loadSettings: async () => null,
    connectToGoogleDriveAndLoad: async () => true,
    signIn: async () => {},
    signOut: async () => {},
    downloadBookForOffline: async () => {},
    refreshToken: async () => true,
  };
}

export function TestReaderRoute({ kind }: { kind: TestReaderKind }) {
  const { book, url } = useMemo(() => testBook(kind), [kind]);
  const appData = useMemo(() => createTestReaderData(book, url), [book, url]);

  return (
    <AppDataOverrideProvider value={appData}>
      <BookReader bookId={book.id} />
    </AppDataOverrideProvider>
  );
}

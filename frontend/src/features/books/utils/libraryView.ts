import type { BookMetadata, Folder, ReadingProgress } from "~/types";

export type LibrarySort = "recentlyAdded" | "title" | "recentlyRead";
export type ReadingProgressByBookId = Record<string, ReadingProgress>;

function time(value: Date | string | undefined): number {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readingProgressRatio(book: BookMetadata, progress?: ReadingProgress): number | null {
  if (!progress) return null;

  if (progress.fileType?.toLowerCase() === "pdf" && progress.currentPage && progress.totalPages) {
    return Math.min(1, Math.max(0, progress.currentPage / progress.totalPages));
  }

  const scrollableHeight =
    progress.scrollHeight && progress.viewportHeight
      ? progress.scrollHeight - progress.viewportHeight
      : 0;
  if (scrollableHeight > 0) {
    return Math.min(1, Math.max(0, progress.currentPosition / scrollableHeight));
  }

  if (book.totalChapters && book.totalChapters > 1) {
    return Math.min(1, Math.max(0, progress.currentChapter / book.totalChapters));
  }

  return progress.currentChapter > 0 || progress.currentPosition > 0 || Boolean(progress.currentPage)
    ? 0.1
    : null;
}

export function filterAndSortBooks(params: {
  books: BookMetadata[];
  folders: Folder[];
  progressByBookId: ReadingProgressByBookId;
  query: string;
  sort: LibrarySort;
}): BookMetadata[] {
  const { books, folders, progressByBookId, sort } = params;
  const query = params.query.trim().toLocaleLowerCase();
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name.toLocaleLowerCase()]));

  const filtered = query
    ? books.filter((book) =>
        [book.title, book.author, book.description, folderNames.get(book.folderId ?? "")]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(query))
      )
    : books;

  return [...filtered].sort((a, b) => {
    if (sort === "title") {
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
    }

    if (sort === "recentlyRead") {
      const progressDifference =
        time(progressByBookId[b.id]?.lastUpdated) - time(progressByBookId[a.id]?.lastUpdated);
      if (progressDifference !== 0) return progressDifference;
    }

    const addedDifference = time(b.uploadedAt) - time(a.uploadedAt);
    if (addedDifference !== 0) return addedDifference;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  });
}

export function continueReadingBooks(
  books: BookMetadata[],
  progressByBookId: ReadingProgressByBookId,
  limit = 5
): Array<{ book: BookMetadata; progress: ReadingProgress; ratio: number | null }> {
  return books
    .flatMap((book) => {
      const progress = progressByBookId[book.id];
      return progress ? [{ book, progress, ratio: readingProgressRatio(book, progress) }] : [];
    })
    .sort((a, b) => time(b.progress.lastUpdated) - time(a.progress.lastUpdated))
    .slice(0, limit);
}

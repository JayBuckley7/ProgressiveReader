import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { BookMetadata } from "~/types";

/**
 * Determine if two book lists contain the same entries.
 * Order is ignored and only stable fields are compared.
 */
export function areBooksEqual(a: BookMetadata[], b: BookMetadata[]): boolean {
  if (a.length !== b.length) return false;

  const serialize = (arr: BookMetadata[]) =>
    arr
      .map((book) => `${book.id}-${book.title}-${book.fileType}-${book.coverImageId ?? ""}`)
      .sort()
      .join("|");

  return serialize(a) === serialize(b);
}

export function applyBooksUpdate(params: {
  previous: BookMetadata[];
  next: BookMetadata[];
  setBooks: Dispatch<SetStateAction<BookMetadata[]>>;
  booksRef: MutableRefObject<BookMetadata[]>;
  cleanupRemoved: (removed: BookMetadata[]) => void;
}) {
  const { previous, next, setBooks, booksRef, cleanupRemoved } = params;

  if (!areBooksEqual(next, previous)) {
    const newIds = new Set(next.map((b) => b.id));
    const removed = previous.filter((b) => !newIds.has(b.id));
    if (removed.length > 0) cleanupRemoved(removed);
  }

  setBooks(next);
  booksRef.current = next;
}


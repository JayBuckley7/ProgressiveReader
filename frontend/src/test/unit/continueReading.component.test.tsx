import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BookMetadata, ReadingProgress } from "~/types";
import { ContinueReading } from "@features/books/components/ContinueReading";
import "~/i18n";

const book: BookMetadata = {
  id: "book-1",
  title: "Test Book",
  fileType: "epub",
  uploadedAt: new Date("2026-07-01"),
  userId: "user-1",
  cloudProvider: "google",
};

const progress: ReadingProgress = {
  bookId: book.id,
  userId: "user-1",
  currentChapter: 2,
  currentPosition: 0,
  lastUpdated: new Date("2026-07-30T12:00:00.000Z"),
};

describe("ContinueReading", () => {
  it("exposes separate remove and collapse controls", () => {
    const onDismiss = vi.fn();
    const onCollapsedChange = vi.fn();

    render(
      <ContinueReading
        items={[{ book, progress, ratio: 0.2 }]}
        onResume={vi.fn()}
        collapsed={false}
        onCollapsedChange={onCollapsedChange}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove Test Book|Test Book.*削除/ }));
    expect(onDismiss).toHaveBeenCalledWith(progress);

    fireEvent.click(screen.getByRole("button", { name: /Hide Continue Reading|閉じる/ }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });
});

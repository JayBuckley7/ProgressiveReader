import { useState } from "react";
import { ContentsDrawer } from "./ContentsDrawer";
import { api } from "~/utils/api"; // Adjust to your trpc/api client location
import type { ChapterTitle } from "../types";

interface ReaderControlsProps {
  currentChapter: number;
  totalChapters: number;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  bookId: string;
  jpdbHighlighted: boolean;
  onToggleHighlight: () => void;
  chapterTitles: ChapterTitle[];
  onSelectChapter: (index: number) => void;
  onToggleTts: () => void;
  ttsActive: boolean;
}

export function ReaderControls({
  currentChapter,
  totalChapters,
  onPrevChapter,
  onNextChapter,
  bookId,
  jpdbHighlighted,
  onToggleHighlight,
  chapterTitles,
  onSelectChapter,
  onToggleTts,
  ttsActive,
}: ReaderControlsProps) {
  const [showDrawer, setShowDrawer] = useState(false);

  const { data: bookmarks = [], isLoading } = api.reading.getBookmarks.useQuery({ bookId });

  const addBookmarkMutation = api.reading.addBookmark.useMutation({
    onSuccess: () => {
      console.log("Bookmark added");
    },
    onError: (err) => {
      console.error("Error adding bookmark:", err);
    },
  });

  const handleAddBookmark = async () => {
    const note = prompt("Add a note for this bookmark (optional):");
    if (note !== null) {
      await addBookmarkMutation.mutateAsync({
        bookId,
        chapterIndex: currentChapter,
        position: window.scrollY, // Replace if using a specific ref
        note: note || undefined,
      });
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-t px-4 py-3">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 max-w-4xl mx-auto">
        <div className="flex gap-2 items-center">
          <button onClick={onPrevChapter} disabled={currentChapter === 0}>← Prev</button>
          <span>{`Chapter ${currentChapter + 1} / ${totalChapters}`}</span>
          <button onClick={onNextChapter} disabled={currentChapter + 1 >= totalChapters}>Next →</button>
        </div>
        <div className="flex gap-2">
          <button onClick={onToggleHighlight}>
            {jpdbHighlighted ? "Disable JPDB Highlight" : "Enable JPDB Highlight"}
          </button>
          <button onClick={onToggleTts}>
            {ttsActive ? "Stop TTS" : "Start TTS"}
          </button>
          <button onClick={handleAddBookmark} disabled={addBookmarkMutation.isLoading}>
            Add Bookmark
          </button>
          <button onClick={() => setShowDrawer(true)}>
            Contents
          </button>
        </div>
      </div>
      {showDrawer && (
        <ContentsDrawer
          onClose={() => setShowDrawer(false)}
          chapterTitles={chapterTitles}
          currentChapter={currentChapter}
          onSelectChapter={onSelectChapter}
          bookmarks={bookmarks}
        />
      )}
    </div>
  );
}

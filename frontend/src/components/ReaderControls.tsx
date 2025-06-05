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
    <div className="bg-white dark:bg-gray-800 border-t px-3 sm:px-4 py-2 sm:py-3 shadow-inner">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevChapter}
            disabled={currentChapter === 0}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Previous chapter"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Chapter {currentChapter + 1} / {totalChapters}
          </span>
          <button
            onClick={onNextChapter}
            disabled={currentChapter + 1 >= totalChapters}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Next chapter"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="flex gap-2 mt-2 sm:mt-0">
          <button
            onClick={onToggleHighlight}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {jpdbHighlighted ? "Disable Highlight" : "Enable Highlight"}
          </button>
          <button
            onClick={onToggleTts}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {ttsActive ? "Stop TTS" : "Start TTS"}
          </button>
          <button
            onClick={handleAddBookmark}
            disabled={addBookmarkMutation.isLoading}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            Bookmark
          </button>
          <button
            onClick={() => setShowDrawer(true)}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
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

import { useState } from "react";
import { ContentsDrawer } from "./ContentsDrawer";
import type { ChapterTitle } from "../types";

interface ReaderControlsProps {
  currentChapter: number;
  totalChapters: number;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  bookId: string; // Was: Id<"books">
  jpdbHighlighted: boolean;
  onToggleHighlight: () => void;
  chapterTitles: ChapterTitle[];
  onSelectChapter: (index: number) => void;
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
}: ReaderControlsProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  // const bookmarksQuery = useQuery(api.reading.getBookmarks, { bookId });
  const bookmarks: any[] = []; // Placeholder
  
  // const addBookmarkMutation = useMutation(api.reading.addBookmark);
  const addBookmark = async (data: any) => { console.log("Add bookmark (TODO):", data); }; // Placeholder

  const handleAddBookmark = async () => {
    const note = prompt("Add a note for this bookmark (optional):");
    if (note !== null) { // User didn't cancel
      await addBookmark({
        bookId,
        chapterIndex: currentChapter,
        position: window.scrollY, // Consider how to get scroll position if BookReader contentRef is not directly accessible
        note: note || undefined,
      });
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-t px-4 py-3">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="flex items-center gap-4">
          <button
            onClick={onPrevChapter}
            disabled={currentChapter === 0}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {currentChapter + 1} / {totalChapters}
          </span>
          
          <button
            onClick={onNextChapter}
            disabled={currentChapter === totalChapters - 1}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex-1 mx-8">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentChapter + 1) / totalChapters) * 100}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddBookmark}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            title="Add bookmark"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          
          <button
            onClick={() => setShowDrawer(!showDrawer)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            title="Table of contents"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>

          <button
            onClick={onToggleHighlight}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            title="Toggle JPDB highlighting"
          >
            <span className="text-sm font-semibold">JP</span>
          </button>
        </div>
      </div>

      <ContentsDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        chapterTitles={chapterTitles}
        currentChapter={currentChapter}
        onSelectChapter={onSelectChapter}
        bookmarks={bookmarks}
      />
    </div>
  );
}

import { useState } from "react";
import { ContentsDrawer } from "./ContentsDrawer";
import { api } from "~/utils/api";
import type { ChapterTitle } from "../types";

interface ReaderControlsProps {
  currentChapter: number;
  totalChapters: number;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  bookId: string;
  chapterTitles: ChapterTitle[];
  onSelectChapter: (index: number) => void;
  onToggleTts: () => void;
  onToggleHighlight: () => void;
  ttsActive: boolean;
  jpdbHighlighted: boolean;
}

export function ReaderControls({
  currentChapter,
  totalChapters,
  onPrevChapter,
  onNextChapter,
  bookId,
  chapterTitles,
  onSelectChapter,
  onToggleTts,
  onToggleHighlight,
  ttsActive,
  jpdbHighlighted,
}: ReaderControlsProps) {
  const [showDrawer, setShowDrawer] = useState(false);

  const { data: bookmarks = [] } =
    api.reading.getBookmarks.useQuery({ bookId });

  const addBookmarkMutation = api.reading.addBookmark.useMutation();

  const handleAddBookmark = async () => {
    const note = prompt("Add a note for this bookmark (optional):");
    if (note !== null) {
      await addBookmarkMutation.mutateAsync({
        bookId,
        chapterIndex: currentChapter,
        position: window.scrollY,
        note: note || undefined,
      });
    }
  };

  /** shared classes for “big” square icon buttons */
  const bigBtn =
    "p-3 rounded-lg transition-colors text-gray-600 dark:text-gray-400 " +
    "hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700";

  return (
    <div className="bg-white dark:bg-gray-800 border-t px-3 sm:px-4 py-2 sm:py-3 shadow-inner">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">

        {/* ─────────── chapter navigation ─────────── */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevChapter}
            disabled={currentChapter === 0}
            className={`${bigBtn} disabled:opacity-50`}
            aria-label="Previous chapter"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 select-none">
            Chapter {currentChapter + 1} / {totalChapters}
          </span>

          <button
            onClick={onNextChapter}
            disabled={currentChapter + 1 >= totalChapters}
            className={`${bigBtn} disabled:opacity-50`}
            aria-label="Next chapter"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* ─────────── action buttons ─────────── */}
        <div className="flex items-center gap-2 mt-2 sm:mt-0">

          {/* JPDB highlight toggle */}
          <button
            onClick={onToggleHighlight}
            className={bigBtn}
            aria-label={jpdbHighlighted ? "Disable JPDB highlight" : "Enable JPDB highlight"}
          >
            {/*  highlighter / marker icon */}
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5l4 4-9 9-4 1 1-4 9-9z" />
            </svg>
          </button>

          {/* TTS toggle */}
          <button
            onClick={onToggleTts}
            className={bigBtn}
            aria-label={ttsActive ? "Stop text to speech" : "Start text to speech"}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9v6" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7v10" />
            </svg>
          </button>

          {/* add bookmark */}
          <button
            onClick={handleAddBookmark}
            disabled={addBookmarkMutation.isLoading}
            className={`${bigBtn} disabled:opacity-50`}
            aria-label="Add bookmark"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 3a2 2 0 00-2 2v13l7-3 7 3V5a2 2 0 00-2-2H5z" />
            </svg>
          </button>

          {/* table-of-contents / bookmarks drawer */}
          <button
            onClick={() => setShowDrawer(true)}
            className={bigBtn}
            aria-label="Table of contents and bookmarks"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* drawer */}
      {showDrawer && (
        <ContentsDrawer
          visible={showDrawer}
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

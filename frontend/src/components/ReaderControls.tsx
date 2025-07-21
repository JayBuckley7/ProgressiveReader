import { useState, useMemo, useEffect } from "react";
import { ContentsDrawer } from "./ContentsDrawer";
import { api } from "~/utils/api.ts";
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
  onTranslate: () => void;
  translating: boolean;
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
  onTranslate,
  translating,
  ttsActive,
  jpdbHighlighted,
}: ReaderControlsProps) {
  const [showDrawer, setShowDrawer] = useState(false);

  const maxLabelLength = useMemo(() => {
    let max = 8; // minimum width in characters
    for (const ch of chapterTitles) {
      if (ch.label && ch.label.length > max) max = ch.label.length;
    }
    return max;
  }, [chapterTitles]);

  const { data: fetchedBookmarks = [] } =
    api.reading.getBookmarks.useQuery({ bookId });

  const [bookmarks, setBookmarks] = useState<typeof fetchedBookmarks>([]);

  useEffect(() => {
    setBookmarks(fetchedBookmarks);
  }, [fetchedBookmarks]);

  const addBookmarkMutation = api.reading.addBookmark.useMutation({
    onSuccess: (newBookmark) => {
      setBookmarks((prev) => [...prev, newBookmark]);
    },
  });

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

  /** shared classes for "big" square icon buttons */
  const bigBtn =
    "p-3 rounded-lg transition-colors text-gray-600 dark:text-gray-400 " +
    "hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700";

  return (
    <div className="bg-white dark:bg-gray-800 border-t px-3 sm:px-4 py-2 sm:py-3 shadow-inner fixed bottom-0 inset-x-0 z-30">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">

        {/* ─────────── chapter navigation ─────────── */}
        <div className="flex items-center gap-2">
          <button
          onClick={onPrevChapter}
          disabled={currentChapter === 0}
          className={`${bigBtn} disabled:opacity-50`}
          aria-label="Previous chapter"
          title="Previous chapter"
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <span
            className="text-sm font-medium text-gray-700 dark:text-gray-300 select-none truncate"
            style={{ width: `${maxLabelLength}ch` }}
          >
            {chapterTitles?.[currentChapter]?.label || `Chapter ${currentChapter + 1}`}
          </span>

          <button
          onClick={onNextChapter}
          disabled={currentChapter + 1 >= totalChapters}
          className={`${bigBtn} disabled:opacity-50`}
          aria-label="Next chapter"
          title="Next chapter"
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
          title={jpdbHighlighted ? "Disable JPDB highlight" : "Enable JPDB highlight"}
        >
          {/*  highlighter / marker icon */}
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5l4 4-9 9-4 1 1-4 9-9z" />
          </svg>
        </button>

        {/* Translate button */}
        <button
          onClick={onTranslate}
          disabled={translating}
          className={`${bigBtn} disabled:opacity-50`}
          aria-label="Translate current chapter"
          title="Translate current chapter"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
          </svg>
        </button>

          {/* TTS toggle */}
          <button
          onClick={onToggleTts}
          className={bigBtn}
          aria-label={ttsActive ? "Stop text to speech" : "Start text to speech"}
          title={ttsActive ? "Stop text to speech" : "Start text to speech"}
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
          title="Add bookmark"
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
          title="Table of contents and bookmarks"
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

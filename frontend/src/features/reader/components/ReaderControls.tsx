import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import ContentsDrawer from "./ContentsDrawer";
import { getBookmarks, addBookmark } from "@features/reader/services/bookmarksApi";
import type { ChapterTitle } from "~/types";
import type { Bookmark } from "~/types/api";
import { appLog } from "@shared/appLog";

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
  mixEnabled: boolean;
  onShowMixSettings: () => void;
}

function ReaderControlsComponent({
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
  mixEnabled,
  onShowMixSettings,
}: ReaderControlsProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const { t } = useTranslation();

  const maxLabelLength = useMemo(() => {
    let max = 8; // minimum width in characters
    for (const ch of chapterTitles) {
      if (ch.title && ch.title.length > max) max = ch.title.length;
    }
    return max;
  }, [chapterTitles]);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(true);
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingBookmarks(true);
    getBookmarks({ bookId })
      .then((data) => {
        if (!cancelled) {
          setBookmarks(data);
        }
      })
      .catch((err) => {
        appLog.error("[ReaderControls] Failed to load bookmarks", err);
        if (!cancelled) {
          setBookmarks([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingBookmarks(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const handleAddBookmark = async () => {
    const note = prompt("Add a note for this bookmark (optional):");
    if (note !== null) {
      setIsAddingBookmark(true);
      try {
        const newBookmark = await addBookmark({
          bookId,
          chapterIndex: currentChapter,
          position: window.scrollY,
          note: note || undefined,
        });
        setBookmarks((prev) => [...prev, newBookmark]);
      } catch (err) {
        appLog.error("[ReaderControls] Failed to add bookmark", err);
      } finally {
        setIsAddingBookmark(false);
      }
    }
  };

  /** shared classes for "big" square icon buttons */
  const bigBtn =
    "p-3 rounded-lg transition-colors text-gray-600 dark:text-gray-400 " +
    "hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700";

  return (
    <div className="bg-white dark:bg-gray-800 border-t px-2 sm:px-4 py-2 shadow-inner fixed bottom-0 inset-x-0 z-30" style={{ pointerEvents: 'auto' }}>
      <div className="max-w-4xl mx-auto">
        {/* Mobile layout */}
        <div className="sm:hidden">
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              onClick={() => setShowDrawer(true)}
              className="p-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
              aria-label={t('reader.controls.toc')}
              title={t('reader.controls.toc')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <button
              onClick={() => setShowDrawer(true)}
              className="flex-1 min-w-0 text-left"
              aria-label={t('reader.controls.toc')}
              title={t('reader.controls.toc')}
            >
              <div className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200">
                <div className="text-xs font-medium truncate">
                  {chapterTitles?.[currentChapter]?.title || `Chapter ${currentChapter + 1}`}
                </div>
                <div className="text-[11px] opacity-75">
                  {currentChapter + 1} / {Math.max(1, totalChapters)} · Swipe left/right to turn
                </div>
              </div>
            </button>

            <button
              onClick={handleAddBookmark}
              disabled={isAddingBookmark}
              className="p-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 flex-shrink-0"
              aria-label={t('reader.controls.bookmarkAdd')}
              title={t('reader.controls.bookmarkAdd')}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 3a2 2 0 00-2 2v13l7-3 7 3V5a2 2 0 00-2-2H5z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <button
              onClick={onToggleHighlight}
              className={`p-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 relative flex-shrink-0 ${jpdbHighlighted ? 'bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200' : ''}`}
              aria-label={jpdbHighlighted ? "Disable JPDB highlight" : "Enable JPDB highlight"}
              title={jpdbHighlighted ? "Disable JPDB highlight" : "Enable JPDB highlight"}
            >
              <svg className={`w-5 h-5 ${jpdbHighlighted ? 'text-yellow-600 dark:text-yellow-300' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5l4 4-9 9-4 1 1-4 9-9z" />
              </svg>
              {jpdbHighlighted && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-500 rounded-full border border-white dark:border-gray-800"></div>
              )}
            </button>
            <button
              onClick={onShowMixSettings}
              className={`p-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 relative flex-shrink-0 ${mixEnabled ? 'bg-emerald-100 dark:bg-emerald-900 border border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200' : ''}`}
              aria-label={mixEnabled ? "Configure Mix Japanese (enabled)" : "Configure Mix Japanese"}
              title={mixEnabled ? "Mix Japanese (enabled)" : "Mix Japanese"}
            >
              <svg className={`w-5 h-5 ${mixEnabled ? 'text-emerald-600 dark:text-emerald-300' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3" />
              </svg>
              {mixEnabled && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full border border-white dark:border-gray-800"></div>
              )}
            </button>
            <button
              onClick={onTranslate}
              disabled={translating}
              className="p-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 flex-shrink-0"
              aria-label={t('reader.controls.translate')}
              title={t('reader.controls.translate')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
              </svg>
            </button>
            <button
              onClick={onToggleTts}
              className="p-2 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
              aria-label={ttsActive ? t('reader.controls.ttsStop') : t('reader.controls.ttsStart')}
              title={ttsActive ? t('reader.controls.ttsStop') : t('reader.controls.ttsStart')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9v6" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7v10" />
              </svg>
            </button>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden sm:flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={onPrevChapter} disabled={currentChapter === 0} className={`${bigBtn} disabled:opacity-50`} aria-label={t('reader.controls.prev')} title={t('reader.controls.prev')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 select-none truncate" style={{ width: `${maxLabelLength}ch` }}>
              {chapterTitles?.[currentChapter]?.title || `Chapter ${currentChapter + 1}`}
            </span>
            <button onClick={onNextChapter} disabled={currentChapter + 1 >= totalChapters} className={`${bigBtn} disabled:opacity-50`} aria-label={t('reader.controls.next')} title={t('reader.controls.next')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onToggleHighlight} className={`${bigBtn} relative ${jpdbHighlighted ? 'bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200' : ''}`} aria-label={jpdbHighlighted ? "Disable JPDB highlight" : "Enable JPDB highlight"} title={jpdbHighlighted ? "Disable JPDB highlight" : "Enable JPDB highlight"}>
              <svg className={`w-6 h-6 ${jpdbHighlighted ? 'text-yellow-600 dark:text-yellow-300' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5l4 4-9 9-4 1 1-4 9-9z" />
              </svg>
              {jpdbHighlighted && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full border-2 border-white dark:border-gray-800"></div>
              )}
            </button>
            <button onClick={onShowMixSettings} className={`${bigBtn} relative ${mixEnabled ? 'bg-emerald-100 dark:bg-emerald-900 border border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200' : ''}`} aria-label={mixEnabled ? "Configure Mix Japanese (enabled)" : "Configure Mix Japanese"} title={mixEnabled ? "Mix Japanese (enabled)" : "Mix Japanese"}>
              <svg className={`w-6 h-6 ${mixEnabled ? 'text-emerald-600 dark:text-emerald-300' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3" />
              </svg>
              {mixEnabled && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-gray-800"></div>
              )}
            </button>
            <button onClick={onTranslate} disabled={translating} className={`${bigBtn} disabled:opacity-50`} aria-label={t('reader.controls.translate')} title={t('reader.controls.translate')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
              </svg>
            </button>
            <button onClick={onToggleTts} className={bigBtn} aria-label={ttsActive ? t('reader.controls.ttsStop') : t('reader.controls.ttsStart')} title={ttsActive ? t('reader.controls.ttsStop') : t('reader.controls.ttsStart')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9v6" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7v10" />
              </svg>
            </button>
            <button onClick={handleAddBookmark} disabled={isAddingBookmark} className={`${bigBtn} disabled:opacity-50`} aria-label={t('reader.controls.bookmarkAdd')} title={t('reader.controls.bookmarkAdd')}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 3a2 2 0 00-2 2v13l7-3 7 3V5a2 2 0 00-2-2H5z" />
              </svg>
            </button>
            <button onClick={() => setShowDrawer(true)} className={bigBtn} aria-label={t('reader.controls.toc')} title={t('reader.controls.toc')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
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

export const ReaderControls = React.memo(ReaderControlsComponent);
export default ReaderControls;

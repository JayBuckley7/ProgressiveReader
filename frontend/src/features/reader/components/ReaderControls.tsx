import React, { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import ContentsDrawer from "./ContentsDrawer";
import type { ChapterTitle } from "~/types";
import type { Bookmark } from "~/types/api";
import { appLog } from "@shared/appLog";
import { useAppDeps } from "@app/deps/AppDepsProvider";

interface ReaderControlsProps {
  visible: boolean;
  onClose: () => void;
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
  visible,
  onClose,
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
  const deps = useAppDeps();
  const [showDrawer, setShowDrawer] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
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
    if (!visible) return;
    let cancelled = false;
    setIsLoadingBookmarks(true);
    deps.backend.bookmarks
      .getBookmarks({ bookId })
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
  }, [bookId, deps.backend.bookmarks, visible]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, visible]);

  useEffect(() => {
    if (!visible) return;

    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-reader-controls-trigger='true']")) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
    };
  }, [onClose, visible]);

  const handleAddBookmark = async () => {
    const note = prompt("Add a note for this bookmark (optional):");
    if (note !== null) {
      setIsAddingBookmark(true);
      try {
        const newBookmark = await deps.backend.bookmarks.addBookmark({
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

  const handlePrevChapter = () => {
    onPrevChapter();
    onClose();
  };

  const handleNextChapter = () => {
    onNextChapter();
    onClose();
  };

  const handleSelectChapter = (index: number) => {
    onSelectChapter(index);
    setShowDrawer(false);
    onClose();
  };

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className="fixed right-2 top-14 z-40 w-[calc(100vw-1rem)] max-w-md sm:right-4 sm:top-16 sm:max-w-xl"
      role="dialog"
      aria-modal="false"
      aria-label="Reader controls"
    >
      <div className="max-h-[calc(100vh-4.5rem)] sm:max-h-[34rem] overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Reader controls</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {chapterTitles?.[currentChapter]?.title || `Chapter ${currentChapter + 1}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close reader controls"
            title="Close reader controls"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
        {/* Mobile layout */}
        <div className="sm:hidden">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={handlePrevChapter}
              disabled={currentChapter === 0}
              className={`${bigBtn} disabled:opacity-50 flex items-center justify-center`}
              aria-label={t('reader.controls.prev')}
              title={t('reader.controls.prev')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNextChapter}
              disabled={currentChapter + 1 >= totalChapters}
              className={`${bigBtn} disabled:opacity-50 flex items-center justify-center`}
              aria-label={t('reader.controls.next')}
              title={t('reader.controls.next')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
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
        <div className="hidden sm:flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button onClick={handlePrevChapter} disabled={currentChapter === 0} className={`${bigBtn} disabled:opacity-50`} aria-label={t('reader.controls.prev')} title={t('reader.controls.prev')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="flex-1 min-w-0 text-sm font-medium text-gray-700 dark:text-gray-300 select-none truncate" style={{ maxWidth: `${maxLabelLength}ch` }}>
              {chapterTitles?.[currentChapter]?.title || `Chapter ${currentChapter + 1}`}
            </span>
            <button onClick={handleNextChapter} disabled={currentChapter + 1 >= totalChapters} className={`${bigBtn} disabled:opacity-50`} aria-label={t('reader.controls.next')} title={t('reader.controls.next')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-6 gap-2">
            <button onClick={onToggleHighlight} className={`${bigBtn} relative flex justify-center ${jpdbHighlighted ? 'bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200' : ''}`} aria-label={jpdbHighlighted ? "Disable JPDB highlight" : "Enable JPDB highlight"} title={jpdbHighlighted ? "Disable JPDB highlight" : "Enable JPDB highlight"}>
              <svg className={`w-6 h-6 ${jpdbHighlighted ? 'text-yellow-600 dark:text-yellow-300' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5l4 4-9 9-4 1 1-4 9-9z" />
              </svg>
              {jpdbHighlighted && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full border-2 border-white dark:border-gray-800"></div>
              )}
            </button>
            <button onClick={onShowMixSettings} className={`${bigBtn} relative flex justify-center ${mixEnabled ? 'bg-emerald-100 dark:bg-emerald-900 border border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200' : ''}`} aria-label={mixEnabled ? "Configure Mix Japanese (enabled)" : "Configure Mix Japanese"} title={mixEnabled ? "Mix Japanese (enabled)" : "Mix Japanese"}>
              <svg className={`w-6 h-6 ${mixEnabled ? 'text-emerald-600 dark:text-emerald-300' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3" />
              </svg>
              {mixEnabled && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-gray-800"></div>
              )}
            </button>
            <button onClick={onTranslate} disabled={translating} className={`${bigBtn} flex justify-center disabled:opacity-50`} aria-label={t('reader.controls.translate')} title={t('reader.controls.translate')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
              </svg>
            </button>
            <button onClick={onToggleTts} className={`${bigBtn} flex justify-center`} aria-label={ttsActive ? t('reader.controls.ttsStop') : t('reader.controls.ttsStart')} title={ttsActive ? t('reader.controls.ttsStop') : t('reader.controls.ttsStart')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9v6" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7v10" />
              </svg>
            </button>
            <button onClick={handleAddBookmark} disabled={isAddingBookmark} className={`${bigBtn} flex justify-center disabled:opacity-50`} aria-label={t('reader.controls.bookmarkAdd')} title={t('reader.controls.bookmarkAdd')}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 3a2 2 0 00-2 2v13l7-3 7 3V5a2 2 0 00-2-2H5z" />
              </svg>
            </button>
            <button onClick={() => setShowDrawer(true)} className={`${bigBtn} flex justify-center`} aria-label={t('reader.controls.toc')} title={t('reader.controls.toc')}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
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
          onSelectChapter={handleSelectChapter}
          bookmarks={bookmarks}
        />
      )}
    </div>
  );
}

export const ReaderControls = React.memo(ReaderControlsComponent);
export default ReaderControls;

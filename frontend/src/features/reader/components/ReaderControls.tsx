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
  contentsVisible: boolean;
  onShowContents: () => void;
  onCloseContents: () => void;
  currentChapter: number;
  totalChapters: number;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  rightToLeftPageTurning?: boolean;
  navigationUnit?: "chapter" | "page";
  bookId: string;
  chapterTitles: ChapterTitle[];
  onSelectChapter: (index: number) => void;
  onSelectBookmark: (bookmark: Bookmark) => void;
  getBookmarkPosition: () => number;
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
  contentsVisible,
  onShowContents,
  onCloseContents,
  currentChapter,
  totalChapters,
  onPrevChapter,
  onNextChapter,
  rightToLeftPageTurning = false,
  navigationUnit = "chapter",
  bookId,
  chapterTitles,
  onSelectChapter,
  onSelectBookmark,
  getBookmarkPosition,
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
  const [, setIsLoadingBookmarks] = useState(true);
  const [isAddingBookmark, setIsAddingBookmark] = useState(false);

  useEffect(() => {
    if (!contentsVisible) return;
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
  }, [bookId, contentsVisible, deps.backend.bookmarks]);

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
          position: getBookmarkPosition(),
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
  const actionBtn =
    "min-h-11 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 " +
    "flex items-center gap-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200 " +
    "transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50";

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
    onCloseContents();
    onClose();
  };

  const previousChapterButton = (
    <button
      type="button"
      onClick={handlePrevChapter}
      disabled={currentChapter === 0}
      className={`${bigBtn} min-h-11 disabled:opacity-50 flex items-center justify-center gap-2`}
      aria-label={t(navigationUnit === "page" ? "reader.controls.prevPage" : "reader.controls.prev")}
    >
      {!rightToLeftPageTurning && (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      )}
      <span>{t(navigationUnit === "page" ? "reader.controls.prevPage" : "reader.controls.prev")}</span>
      {rightToLeftPageTurning && (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
  const nextChapterButton = (
    <button
      type="button"
      onClick={handleNextChapter}
      disabled={currentChapter + 1 >= totalChapters}
      className={`${bigBtn} min-h-11 disabled:opacity-50 flex items-center justify-center gap-2`}
      aria-label={t(navigationUnit === "page" ? "reader.controls.nextPage" : "reader.controls.next")}
    >
      {rightToLeftPageTurning && (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      )}
      <span>{t(navigationUnit === "page" ? "reader.controls.nextPage" : "reader.controls.next")}</span>
      {!rightToLeftPageTurning && (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );

  if (!visible && !contentsVisible) return null;

  return (
    <>
      {visible && (
        <div
          ref={panelRef}
          className="fixed right-2 top-14 z-40 w-[calc(100vw-1rem)] max-w-md sm:right-4 sm:top-16 sm:max-w-xl"
          role="dialog"
          aria-modal="false"
          aria-label={t("reader.controls.panelTitle")}
        >
          <div className="max-h-[calc(100vh-4.5rem)] sm:max-h-[34rem] overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t("reader.controls.panelTitle")}
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {chapterTitles?.[currentChapter]?.title ||
                t("reader.controls.chapterFallback", { chapter: currentChapter + 1 })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={t("reader.controls.close")}
            title={t("reader.controls.close")}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            {rightToLeftPageTurning ? nextChapterButton : previousChapterButton}
            {rightToLeftPageTurning ? previousChapterButton : nextChapterButton}
          </div>

          <div className="my-3 rounded-md bg-gray-100 px-3 py-2 dark:bg-gray-700/60">
            <div className="truncate text-sm font-medium text-gray-700 dark:text-gray-200" style={{ maxWidth: `${maxLabelLength + 8}ch` }}>
              {chapterTitles?.[currentChapter]?.title ||
                t("reader.controls.chapterFallback", { chapter: currentChapter + 1 })}
            </div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t("reader.controls.progress", {
                current: currentChapter + 1,
                total: Math.max(1, totalChapters),
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              onClick={onTranslate}
              disabled={translating}
              className={actionBtn}
              aria-label={t('reader.controls.translate')}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
              </svg>
              <span>
                {translating ? t("reader.controls.translating") : t("reader.controls.translateShort")}
              </span>
            </button>
            <button
              onClick={onToggleTts}
              className={actionBtn}
              aria-label={ttsActive ? t('reader.controls.ttsStop') : t('reader.controls.ttsStart')}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5 6 9H2v6h4l5 4V5zM19 9v6M15 7v10" />
              </svg>
              <span>{ttsActive ? t("reader.controls.stopReading") : t("reader.controls.readAloud")}</span>
            </button>
            <button
              onClick={onToggleHighlight}
              className={`${actionBtn} ${jpdbHighlighted ? "border-yellow-400 bg-yellow-50 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-100" : ""}`}
              aria-label={
                jpdbHighlighted
                  ? t("reader.controls.highlightDisable")
                  : t("reader.controls.highlightEnable")
              }
              aria-pressed={jpdbHighlighted}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 5 4 4-9 9-4 1 1-4 9-9z" />
              </svg>
              <span>{t("reader.controls.highlight")}</span>
            </button>
            <button
              onClick={onShowMixSettings}
              className={`${actionBtn} ${mixEnabled ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" : ""}`}
              aria-label={
                mixEnabled
                  ? t("reader.controls.mixConfigureEnabled")
                  : t("reader.controls.mixConfigure")
              }
              aria-pressed={mixEnabled}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3" />
              </svg>
              <span>{t("reader.controls.mix")}</span>
            </button>
            <button
              onClick={handleAddBookmark}
              disabled={isAddingBookmark}
              className={actionBtn}
              aria-label={t('reader.controls.bookmarkAdd')}
            >
              <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 3a2 2 0 0 0-2 2v13l7-3 7 3V5a2 2 0 0 0-2-2H5z" />
              </svg>
              <span>{isAddingBookmark ? t("reader.controls.saving") : t("reader.controls.bookmark")}</span>
            </button>
            <button
              onClick={onShowContents}
              className={actionBtn}
              aria-label={t('reader.controls.toc')}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>{t("reader.controls.contents")}</span>
            </button>
          </div>
        </div>
          </div>
        </div>
      )}

      {contentsVisible && (
        <ContentsDrawer
          visible={contentsVisible}
          onClose={onCloseContents}
          chapterTitles={chapterTitles}
          currentChapter={currentChapter}
          onSelectChapter={handleSelectChapter}
          onSelectBookmark={onSelectBookmark}
          bookmarks={bookmarks}
        />
      )}
    </>
  );
}

export const ReaderControls = React.memo(ReaderControlsComponent);
export default ReaderControls;

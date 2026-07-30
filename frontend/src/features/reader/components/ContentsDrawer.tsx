import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ChapterTitle } from "~/types";
import type { Bookmark } from "~/types/api";

interface ContentsDrawerProps {
  visible: boolean;
  onClose: () => void;
  chapterTitles: ChapterTitle[];
  currentChapter: number;
  onSelectChapter: (index: number) => void;
  bookmarks: Bookmark[];
}

export default function ContentsDrawer({ visible, onClose, chapterTitles, currentChapter, onSelectChapter, bookmarks, }: ContentsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"toc" | "bookmarks">("toc");
  const { t } = useTranslation();

  useEffect(() => {
    if (visible) setActiveTab("toc");
  }, [visible]);

  const tabClass = (tab: "toc" | "bookmarks") =>
    `flex-1 text-center py-2 text-sm font-medium cursor-pointer border-b-2 ${
      activeTab === tab
        ? "border-blue-500 text-blue-600 dark:text-blue-400"
        : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
    }`;

  return (
    <div
      className={`fixed inset-0 z-40 ${visible ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-contents-title"
    >
      <div className={`absolute inset-0 bg-black/30 transition-opacity ${visible ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <div className={`absolute left-0 top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-xl transform transition-transform ${visible ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <h3 id="reader-contents-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('reader.toc.menu')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label={t("reader.controls.close")}
            title={t("reader.controls.close")}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="flex">
          <button className={tabClass("toc")} onClick={() => setActiveTab("toc")}>{t('reader.toc.tab.toc')}</button>
          <button className={tabClass("bookmarks")} onClick={() => setActiveTab("bookmarks")}>{t('reader.toc.tab.bookmarks')}</button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-96px)] p-3 space-y-2">
          {activeTab === "toc" && (
            <ul>
              {chapterTitles.map(ch => (
                <li key={ch.index}>
                  <button onClick={() => { onSelectChapter(ch.index); onClose(); }} className={`block w-full text-left px-2 py-1 rounded ${ch.index === currentChapter ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                    {ch.label || t('reader.chapterNumber', { number: ch.index + 1 })}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {activeTab === "bookmarks" && (
            <div>
              {bookmarks && bookmarks.length > 0 ? (
                <ul className="space-y-2">
                  {bookmarks.map((bookmark) => (
                    <li
                      key={String(bookmark.id ?? `${bookmark.bookId}:${bookmark.chapterIndex}:${bookmark.position}`)}
                      className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <div className="text-sm font-medium">
                        {chapterTitles?.[bookmark.chapterIndex]?.label ||
                          t("reader.chapterNumber", { number: bookmark.chapterIndex + 1 })}
                      </div>
                      {typeof bookmark.note === "string" && bookmark.note.trim() ? (
                        <div className="text-xs text-gray-600 dark:text-gray-400">{bookmark.note}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('reader.toc.empty')}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


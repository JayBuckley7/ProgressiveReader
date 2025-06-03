import { useState, useEffect } from "react";

interface ContentsDrawerProps {
  visible: boolean;
  onClose: () => void;
  chapterTitles: string[];
  currentChapter: number;
  onSelectChapter: (index: number) => void;
  bookmarks: any[];
}

export function ContentsDrawer({
  visible,
  onClose,
  chapterTitles,
  currentChapter,
  onSelectChapter,
  bookmarks,
}: ContentsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"toc" | "bookmarks">("toc");

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
    <div className={`fixed inset-0 z-40 ${visible ? "" : "pointer-events-none"}`}> 
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute left-0 top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-xl transform transition-transform ${visible ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Menu</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
        <div className="flex">
          <button className={tabClass("toc")} onClick={() => setActiveTab("toc")}>Table of Contents</button>
          <button className={tabClass("bookmarks")} onClick={() => setActiveTab("bookmarks")}>Bookmarks</button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-96px)] p-3 space-y-2">
          {activeTab === "toc" && (
            <ul>
              {chapterTitles.map((title, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => {
                      onSelectChapter(idx);
                      onClose();
                    }}
                    className={`block w-full text-left px-2 py-1 rounded ${idx === currentChapter ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                  >
                    {title || `Chapter ${idx + 1}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {activeTab === "bookmarks" && (
            <div>
              {bookmarks && bookmarks.length > 0 ? (
                <ul className="space-y-2">
                  {bookmarks.map((bookmark: any) => (
                    <li key={bookmark._id || bookmark.id} className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                      <div className="text-sm font-medium">Chapter {bookmark.chapterIndex + 1}</div>
                      {bookmark.note && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">{bookmark.note}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">No bookmarks yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

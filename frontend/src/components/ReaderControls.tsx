import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface ReaderControlsProps {
  currentChapter: number;
  totalChapters: number;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  bookId: Id<"books">;
}

export function ReaderControls({
  currentChapter,
  totalChapters,
  onPrevChapter,
  onNextChapter,
  bookId,
}: ReaderControlsProps) {
  const [showBookmarks, setShowBookmarks] = useState(false);
  const bookmarks = useQuery(api.reading.getBookmarks, { bookId });
  const addBookmark = useMutation(api.reading.addBookmark);

  const handleAddBookmark = async () => {
    const note = prompt("Add a note for this bookmark (optional):");
    if (note !== null) { // User didn't cancel
      await addBookmark({
        bookId,
        chapterIndex: currentChapter,
        position: window.scrollY,
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
            onClick={() => setShowBookmarks(!showBookmarks)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            title="View bookmarks"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bookmarks Panel */}
      {showBookmarks && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h3 className="font-semibold mb-3">Bookmarks</h3>
          {bookmarks && bookmarks.length > 0 ? (
            <div className="space-y-2">
              {bookmarks.map((bookmark) => (
                <div
                  key={bookmark._id}
                  className="p-2 bg-white dark:bg-gray-600 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-500"
                >
                  <div className="text-sm font-medium">
                    Chapter {bookmark.chapterIndex + 1}
                  </div>
                  {bookmark.note && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {bookmark.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No bookmarks yet. Click the bookmark icon to add one.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

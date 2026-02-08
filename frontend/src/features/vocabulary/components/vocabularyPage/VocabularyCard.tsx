import type { BookMetadata } from "~/types";
import type { VocabularyWord } from "./types";

export interface VocabularyCardProps {
  word: VocabularyWord;
  books: BookMetadata[];
  onToggleMastered: (wordId: string) => void;
}

export function VocabularyCard({ word, books, onToggleMastered }: VocabularyCardProps) {
  const book = word.bookId ? books.find((b) => b.id === word.bookId) : null;

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case "easy":
        return "bg-green-100 text-green-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "hard":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{word.word}</h3>
            <span className="text-lg text-gray-600 dark:text-gray-300">→ {word.translation}</span>
            {word.difficulty && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(word.difficulty)}`}>
                {word.difficulty}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {word.language}
            </span>
            {book && <span>📖 {book.title}</span>}
            <span>{new Date(word._creationTime).toLocaleDateString()}</span>
          </div>
          {word.context && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{word.context}"</p>
            </div>
          )}
        </div>
        <button
          onClick={() => onToggleMastered(word._id)}
          className={`ml-4 px-4 py-2 rounded-lg font-medium transition-colors ${
            word.mastered
              ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          {word.mastered ? "✓ Mastered" : "Learning"}
        </button>
      </div>
    </div>
  );
}


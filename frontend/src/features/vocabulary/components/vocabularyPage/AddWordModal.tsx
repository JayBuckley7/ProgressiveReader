import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { addVocabularyWord } from "@features/vocabulary/services/vocabApi";
import type { BookMetadata } from "~/types";

export interface AddWordModalProps {
  onClose: () => void;
  onAdded: () => void | Promise<void>;
  books: BookMetadata[];
}

export function AddWordModal({ onClose, onAdded, books }: AddWordModalProps) {
  const { t } = useTranslation();
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [language, setLanguage] = useState("English");
  const [bookId, setBookId] = useState("");
  const [context, setContext] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !translation.trim()) {
      notifyError("Word and translation are required");
      return;
    }
    setIsSubmitting(true);
    try {
      await addVocabularyWord({
        word: word.trim(),
        translation: translation.trim(),
        language,
        bookId: bookId || undefined,
        context: context.trim() || undefined,
        difficulty: difficulty || undefined,
      });
      toast.success("Word added successfully!");
      await onAdded();
    } catch (error) {
      appLog.error("[VocabularyPage] Failed to add word", error);
      notifyError(error, { title: "Failed to add word" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("vocabulary.addModal.title")}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              ✕
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.word")}
              </label>
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
                placeholder={t("vocabulary.addModal.placeholders.word")}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.translation")}
              </label>
              <input
                type="text"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
                placeholder={t("vocabulary.addModal.placeholders.translation")}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.language")}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="Chinese">Chinese</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.book")}
              </label>
              <select
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
              >
                <option value="">{t("vocabulary.addModal.placeholders.selectBook")}</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title} - {book.author}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.difficulty")}
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard" | "")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
              >
                <option value="">{t("vocabulary.addModal.placeholders.selectDifficulty")}</option>
                <option value="easy">{t("vocabulary.addModal.difficultyOptions.easy")}</option>
                <option value="medium">{t("vocabulary.addModal.difficultyOptions.medium")}</option>
                <option value="hard">{t("vocabulary.addModal.difficultyOptions.hard")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("vocabulary.addModal.labels.context")}
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none dark:bg-gray-700 dark:text-white"
                placeholder={t("vocabulary.addModal.placeholders.context")}
              />
            </div>
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {t("vocabulary.addModal.buttons.cancel")}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? t("vocabulary.addModal.buttons.submitting") : t("vocabulary.addModal.buttons.submit")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


import type { BookMetadata } from "~/types";
import type { VocabularyWord } from "./types";
import { VocabularyCard } from "./VocabularyCard";

export function UserVocabularyList({
  t,
  isSignedIn,
  vocabError,
  isLoadingVocabulary,
  vocabulary,
  filteredVocabulary,
  books,
  onToggleMastered,
}: {
  t: (key: string) => string;
  isSignedIn: boolean;
  vocabError: string | null;
  isLoadingVocabulary: boolean;
  vocabulary: VocabularyWord[];
  filteredVocabulary: VocabularyWord[];
  books: BookMetadata[];
  onToggleMastered: (wordId: string) => void;
}) {
  return (
    <>
      {!isSignedIn && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          Sign in to view and manage vocabulary. JPDB features also require your JPDB API key (Settings → Highlight).
        </div>
      )}

      {vocabError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {vocabError}
        </div>
      )}

      {isLoadingVocabulary ? (
        <div className="flex justify-center py-12">
          <div className="app-muted animate-spin rounded-full h-8 w-8 border-b-2 border-current" />
        </div>
      ) : filteredVocabulary.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {vocabulary.length === 0 ? t("vocabulary.empty.noneYet") : t("vocabulary.empty.noneFound")}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {vocabulary.length === 0 ? t("vocabulary.empty.promptAdd") : t("vocabulary.empty.noneFound")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredVocabulary.map((word) => (
            <VocabularyCard key={word._id} word={word} books={books} onToggleMastered={onToggleMastered} />
          ))}
        </div>
      )}
    </>
  );
}


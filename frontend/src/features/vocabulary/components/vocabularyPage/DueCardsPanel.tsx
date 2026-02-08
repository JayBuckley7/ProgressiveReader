import type { JpdbLookupVocabularyEntry } from "@features/vocabulary/services/vocabApi";
import type { DueVocabProgress } from "./types";
import { formatDueAt } from "./due";

export function DueCardsPanel({
  t,
  selectedDeckId,
  selectedDeckName,
  dueVocabEntries,
  dueVocabError,
  dueVocabProgress,
  isSignedIn,
  isLoadingDueVocab,
  onRefresh,
}: {
  t: (key: string) => string;
  selectedDeckId: string;
  selectedDeckName: string;
  dueVocabEntries: JpdbLookupVocabularyEntry[];
  dueVocabError: string | null;
  dueVocabProgress: DueVocabProgress | null;
  isSignedIn: boolean;
  isLoadingDueVocab: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold">{t("vocabulary.dueCards.title")}</h2>
        {selectedDeckName ? (
          <div className="text-sm text-gray-600 dark:text-gray-400">Deck: {selectedDeckName}</div>
        ) : null}
      </div>

      {dueVocabError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {dueVocabError}
        </div>
      )}

      {dueVocabEntries.length > 0 ? (
        <>
          <ul className="grid gap-2 mb-4">
            {dueVocabEntries.slice(0, 12).map((entry) => {
              const dueLabel = formatDueAt(entry.due_at);
              return (
                <li key={`${entry.vid}:${entry.sid}`} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {String(entry.spelling || "")}
                      {entry.reading ? (
                        <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">
                          {String(entry.reading)}
                        </span>
                      ) : null}
                    </div>
                    {Array.isArray(entry.meanings) && entry.meanings.length > 0 ? (
                      <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                        {String(entry.meanings[0])}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-xs text-gray-500 dark:text-gray-400 text-right">
                    {dueLabel ? `Due: ${dueLabel}` : "Due"}
                  </div>
                </li>
              );
            })}
          </ul>
          {dueVocabEntries.length > 12 && (
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              + {dueVocabEntries.length - 12} more
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {selectedDeckId ? t("vocabulary.dueCards.none") : "Select a deck below to compute due cards."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onRefresh}
          disabled={!isSignedIn || !selectedDeckId || isLoadingDueVocab}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingDueVocab ? "Refreshing…" : t("vocabulary.dueCards.fetch")}
        </button>
        {dueVocabProgress && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {dueVocabProgress.phase === "scan" ? "Scanning" : "Loading"} {dueVocabProgress.loaded}/
            {dueVocabProgress.total}
          </div>
        )}
      </div>
    </div>
  );
}


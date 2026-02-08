import type { JpdbLookupVocabularyEntry, JpdbVocabPair } from "@features/vocabulary/services/vocabApi";
import { DeckSelector } from "../DeckSelector";
import type { DueGroup } from "./due";
import { formatDueDate } from "./due";

export function DeckPanel({
  t,
  isSignedIn,
  selectedDeckId,
  onDeckSelect,
  onOpenDeck,
  onLoadMore,
  deckVocabPairs,
  deckVocabEntries,
  deckVocabError,
  isLoadingDeckVocab,
  groupedDeckVocabulary,
}: {
  t: (key: string) => string;
  isSignedIn: boolean;
  selectedDeckId: string;
  onDeckSelect: (deck: { id: string; name: string }) => void;
  onOpenDeck: () => void | Promise<void>;
  onLoadMore: () => void | Promise<void>;
  deckVocabPairs: JpdbVocabPair[];
  deckVocabEntries: JpdbLookupVocabularyEntry[];
  deckVocabError: string | null;
  isLoadingDeckVocab: boolean;
  groupedDeckVocabulary: DueGroup[];
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-8">
      <h2 className="text-xl font-bold mb-4">{t("vocabulary.decks.title")}</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">{t("vocabulary.decks.description")}</p>

      {isSignedIn ? (
        <DeckSelector
          selectedDeckId={selectedDeckId}
          onDeckSelect={(deck) => {
            onDeckSelect(deck);
          }}
        />
      ) : (
        <div className="text-sm app-muted">Sign in to load JPDB decks.</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onOpenDeck}
          disabled={!isSignedIn || !selectedDeckId || isLoadingDeckVocab}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Open deck
        </button>
        <button
          onClick={onLoadMore}
          disabled={!deckVocabPairs.length || deckVocabEntries.length >= deckVocabPairs.length || isLoadingDeckVocab}
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Load more
        </button>
        {deckVocabPairs.length > 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Loaded {deckVocabEntries.length}/{deckVocabPairs.length}
          </div>
        )}
        {isLoadingDeckVocab && <div className="text-sm text-gray-600 dark:text-gray-400">Loading…</div>}
      </div>

      {deckVocabError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {deckVocabError}
        </div>
      )}

      {deckVocabEntries.length > 0 && (
        <div className="mt-5 space-y-3">
          {groupedDeckVocabulary.map((group) => (
            <details
              key={group.key}
              open={group.defaultOpen}
              className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700"
            >
              <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-4">
                <div className="font-semibold text-gray-900 dark:text-white">{group.label}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{group.entries.length}</div>
              </summary>
              <div className="px-4 pb-4 grid gap-3">
                {group.entries.map((entry) => {
                  const dueDate = formatDueDate(entry.due_at);
                  return (
                    <div
                      key={`${entry.vid}:${entry.sid}`}
                      className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-3">
                            <div className="text-lg font-semibold text-gray-900 dark:text-white">
                              {String(entry.spelling || "")}
                            </div>
                            {entry.reading ? (
                              <div className="text-sm text-gray-600 dark:text-gray-300">
                                {String(entry.reading)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {dueDate ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400">Due {dueDate}</div>
                          ) : null}
                          {typeof entry.frequency_rank === "number" ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400">#{entry.frequency_rank}</div>
                          ) : null}
                        </div>
                      </div>
                      {Array.isArray(entry.meanings) && entry.meanings.length > 0 ? (
                        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                          {entry.meanings.slice(0, 2).join("; ")}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

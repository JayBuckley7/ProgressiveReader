import type { JlptLevel, JpdbDeckBinding, LevelReadinessState } from "@features/jlpt/types";
import { getAppliedDailyTarget, getBindingSnapshot, getDerivedDailyTarget, getLevelReadinessSummary } from "@features/jlpt/services/jlptSelectors";

type JpdbDeckOption = {
  id: string;
  name: string;
  words?: number | null;
};

export function JpdbReadinessDrawer(props: {
  level: JlptLevel | null;
  isOpen: boolean;
  apiKeyConfigured: boolean;
  levelState: LevelReadinessState | null;
  activeExamDate: string | null;
  decks: JpdbDeckOption[];
  decksError: string | null;
  isLoadingDecks: boolean;
  isCheckingProgress: boolean;
  onClose: () => void;
  onAddBinding: (level: JlptLevel) => void;
  onRemoveBinding: (level: JlptLevel, bindingId: string) => void;
  onBindingChange: (level: JlptLevel, bindingId: string, updates: Partial<JpdbDeckBinding>) => void;
  onRefreshProgress: (level: JlptLevel) => void;
}) {
  const {
    activeExamDate,
    apiKeyConfigured,
    decks,
    decksError,
    isCheckingProgress,
    isLoadingDecks,
    isOpen,
    level,
    levelState,
    onAddBinding,
    onBindingChange,
    onClose,
    onRefreshProgress,
    onRemoveBinding,
  } = props;

  if (!isOpen || !level || !levelState) return null;

  const readiness = getLevelReadinessSummary(levelState);
  const derivedTarget = activeExamDate ? getDerivedDailyTarget({
    level,
    testRef: null,
    title: `${level} readiness`,
    examDate: activeExamDate,
    targetMode: "derived",
    dailyTargetOverride: null,
    updatedAt: new Date().toISOString(),
  }, levelState) : 0;
  const appliedTarget = activeExamDate ? getAppliedDailyTarget({
    level,
    testRef: null,
    title: `${level} readiness`,
    examDate: activeExamDate,
    targetMode: "derived",
    dailyTargetOverride: null,
    updatedAt: new Date().toISOString(),
  }, levelState) : 0;

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/30" aria-label="Close JPDB readiness drawer" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
          <div>
            <div className="text-sm font-medium text-gray-500">{level} folder</div>
            <h2 className="text-xl font-semibold text-gray-950">JPDB readiness</h2>
          </div>
          <button
            onClick={onClose}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className={`inline-flex rounded-md px-3 py-1 text-sm font-medium ${apiKeyConfigured ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
            {apiKeyConfigured ? "JPDB API key configured" : "JPDB API key missing"}
          </div>

          {!apiKeyConfigured ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Add your JPDB API key in Settings to load decks and calculate readiness.
            </div>
          ) : (
            <>
              {decksError && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {decksError}
                </div>
              )}

              <div className="mt-5 space-y-4">
                {levelState.bindings.length === 0 && (
                  <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                    Add any JPDB deck that should count toward this folder.
                  </div>
                )}

                {levelState.bindings.map((binding, index) => {
                  const deckSnapshot = getBindingSnapshot(levelState, binding.id);
                  return (
                    <div key={binding.id} className="rounded-md border border-gray-200 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-gray-900">Deck {index + 1}</div>
                        <button
                          type="button"
                          onClick={() => onRemoveBinding(level, binding.id)}
                          className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-xs font-medium text-gray-500">Enabled</label>
                          <input
                            type="checkbox"
                            checked={binding.enabled}
                            onChange={(event) => onBindingChange(level, binding.id, { enabled: event.target.checked })}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">Label</label>
                          <input
                            value={binding.label}
                            onChange={(event) => onBindingChange(level, binding.id, { label: event.target.value })}
                            placeholder="Vocabulary, grammar, reading..."
                            className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-950"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">JPDB deck</label>
                          <select
                            value={binding.deckId}
                            disabled={isLoadingDecks}
                            onChange={(event) => {
                              const deck = decks.find((item) => item.id === event.target.value);
                              onBindingChange(level, binding.id, {
                                deckId: event.target.value,
                                deckName: deck?.name,
                              });
                            }}
                            className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-950"
                          >
                            <option value="">{isLoadingDecks ? "Loading decks..." : "Choose a deck"}</option>
                            {decks.map((deck) => (
                              <option key={deck.id} value={deck.id}>
                                {deck.name} ({deck.id})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-500">Deck id</label>
                            <input
                              value={binding.deckId}
                              onChange={(event) => onBindingChange(level, binding.id, { deckId: event.target.value.trim() })}
                              placeholder="12"
                              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-950"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-500">Target</label>
                            <input
                              type="number"
                              min="0"
                              value={binding.dailyTargetOverride ?? ""}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                onBindingChange(level, binding.id, {
                                  dailyTargetOverride: Number.isFinite(value) && value > 0 ? value : null,
                                });
                              }}
                              placeholder="0/day"
                              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-950"
                            />
                          </div>
                        </div>

                        {deckSnapshot && (
                          <div className="text-xs text-gray-500">
                            {binding.label || binding.deckName || `Deck ${binding.deckId}`}: {deckSnapshot.known} / {deckSnapshot.total} known ({deckSnapshot.progressPercent}%)
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => onAddBinding(level)}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Add deck
                </button>

                <button
                  onClick={() => onRefreshProgress(level)}
                  disabled={!levelState.bindings.some((binding) => binding.deckId.trim()) || isCheckingProgress}
                  className="h-10 w-full rounded-md border border-gray-950 bg-gray-950 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCheckingProgress ? "Checking..." : "Check deck progress"}
                </button>
              </div>

              <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">
                    {readiness.total > 0 ? `${readiness.known} / ${readiness.total} known` : "No progress loaded"}
                  </span>
                  <span className="text-gray-500">{readiness.percent}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-sm bg-gray-200">
                  <div className="h-full bg-green-500" style={{ width: `${readiness.percent}%` }} />
                </div>
                {readiness.total > 0 && (
                  <div className="mt-3 space-y-1 text-sm text-gray-600">
                    <div>{readiness.remaining} remaining</div>
                    <div>{derivedTarget}/day needed by the exam date</div>
                    <div>{appliedTarget > 0 ? `${appliedTarget}/day applied target` : "No manual target set"}</div>
                    <div className="text-xs text-gray-500">
                      {levelState.lastCheckedAt ? `Last checked ${new Date(levelState.lastCheckedAt).toLocaleString()}` : "Refresh deck progress to update today's progress."}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

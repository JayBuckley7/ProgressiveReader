import { Link } from "react-router-dom";

import type { JlptGrammarWorkbenchSummary, JlptVocabularyWorkbenchSummary } from "@features/jlpt/hooks/useJlptWorkbenchSummary";

const cardClass = "app-card rounded-md";
const mutedTextClass = "text-[color:var(--ui-muted)]";
const buttonPrimaryClass = "app-button-primary inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors";
const buttonMutedClass =
  "app-button-muted h-9 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function JlptStudyWorkbenchCards(props: {
  vocabulary: JlptVocabularyWorkbenchSummary;
  grammar: JlptGrammarWorkbenchSummary;
  onOpenActiveReadiness: () => void;
  canOpenActiveReadiness: boolean;
  onRefreshVocabularyProgress: () => void;
  canRefreshVocabularyProgress: boolean;
  isRefreshingVocabularyProgress: boolean;
}) {
  const {
    canOpenActiveReadiness,
    canRefreshVocabularyProgress,
    grammar,
    isRefreshingVocabularyProgress,
    onOpenActiveReadiness,
    onRefreshVocabularyProgress,
    vocabulary,
  } = props;

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--ui-text)]">Vocab and grammar</h2>
          <div className={`text-sm ${mutedTextClass}`}>Keep your supporting study work aligned with the current JLPT goal.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={`${cardClass} p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`text-sm font-medium ${mutedTextClass}`}>Vocabulary</div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">
                {vocabulary.levelLabel ? `${vocabulary.levelLabel} focus` : "Study overview"}
              </div>
            </div>
            <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-300">
              {vocabulary.linkedDeckCount} linked deck{vocabulary.linkedDeckCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-[color:var(--ui-border)] pt-4">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className={`text-xs font-medium ${mutedTextClass}`}>Known</div>
                <button
                  type="button"
                  onClick={onRefreshVocabularyProgress}
                  disabled={!canRefreshVocabularyProgress || isRefreshingVocabularyProgress}
                  aria-label={isRefreshingVocabularyProgress ? "Refreshing vocabulary snapshot" : "Refresh vocabulary snapshot"}
                  title={isRefreshingVocabularyProgress ? "Refreshing vocabulary snapshot" : "Refresh vocabulary snapshot"}
                  className="app-button-muted inline-flex h-7 w-7 -translate-y-0.5 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    className={`h-3.5 w-3.5 ${isRefreshingVocabularyProgress ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 4v5h5M20 20v-5h-5" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 9a8 8 0 0 0-13.66-3.66L4 9m16 6-2.34 3.66A8 8 0 0 1 4 15" />
                  </svg>
                </button>
              </div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">
                {vocabulary.total > 0 ? `${vocabulary.known}/${vocabulary.total}` : "No data"}
              </div>
            </div>
            <div>
              <div className={`text-xs font-medium ${mutedTextClass}`}>Remaining</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">{vocabulary.total > 0 ? vocabulary.remaining : 0}</div>
            </div>
            <div>
              <div className={`text-xs font-medium ${mutedTextClass}`}>Known today</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">{vocabulary.todayKnownGain}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-[color:var(--ui-text)]">JPDB progress</span>
              <span className={mutedTextClass}>{vocabulary.percent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-sm bg-[color:var(--ui-border)]">
              <div className="app-progress-bar h-full" style={{ width: `${vocabulary.percent}%` }} />
            </div>
          </div>

          <div className={`mt-4 space-y-1 text-sm ${mutedTextClass}`}>
            {vocabulary.selectedDeckName ? (
              <div>
                Cached due cards for <span className="font-medium text-[color:var(--ui-text)]">{vocabulary.selectedDeckName}</span>:{" "}
                <span className="font-medium text-[color:var(--ui-text)]">{vocabulary.cachedDueCount ?? "Not loaded"}</span>
              </div>
            ) : (
              <div>Pick a JPDB deck in Vocabulary to track cached due cards here.</div>
            )}
            <div>
              {vocabulary.lastCheckedAt
                ? `Readiness last checked ${new Date(vocabulary.lastCheckedAt).toLocaleString()}`
                : "Refresh JLPT deck progress to update the linked-deck snapshot."}
            </div>
            {vocabulary.cachedDueCheckedAt ? <div>Due snapshot cached {new Date(vocabulary.cachedDueCheckedAt).toLocaleString()}</div> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/vocabulary"
              className={buttonPrimaryClass}
            >
              Open vocabulary
            </Link>
            <button
              type="button"
              onClick={onOpenActiveReadiness}
              disabled={!canOpenActiveReadiness}
              className={buttonMutedClass}
            >
              Open readiness
            </button>
          </div>
        </div>

        <div className={`${cardClass} p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={`text-sm font-medium ${mutedTextClass}`}>Grammar</div>
              <div className="mt-1 text-lg font-semibold text-[color:var(--ui-text)]">
                {grammar.levelLabel ? `${grammar.levelLabel} focus` : "Study overview"}
              </div>
            </div>
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${grammar.miningEnabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-muted)]"}`}>
              {grammar.miningEnabled ? "Mining on" : "Mining off"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-[color:var(--ui-border)] pt-4">
            <div>
              <div className={`text-xs font-medium ${mutedTextClass}`}>Known</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">
                {grammar.totalCount > 0 ? `${grammar.knownCount}/${grammar.totalCount}` : "No data"}
              </div>
            </div>
            <div>
              <div className={`text-xs font-medium ${mutedTextClass}`}>Remaining</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">{grammar.totalCount > 0 ? grammar.remainingCount : 0}</div>
            </div>
            <div>
              <div className={`text-xs font-medium ${mutedTextClass}`}>Known today</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">{grammar.todayKnownGain}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-[color:var(--ui-text)]">Grammar progress</span>
              <span className={mutedTextClass}>{grammar.percent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-sm bg-[color:var(--ui-border)]">
              <div className="app-progress-bar h-full" style={{ width: `${grammar.percent}%` }} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-[color:var(--ui-border)] pt-4">
            <div>
              <div className={`text-xs font-medium ${mutedTextClass}`}>Learning</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">{grammar.learningCount}</div>
            </div>
            <div>
              <div className={`text-xs font-medium ${mutedTextClass}`}>With examples</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">{grammar.exampleBackedCount}</div>
            </div>
            <div>
              <div className={`text-xs font-medium ${mutedTextClass}`}>Queued</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ui-text)]">{grammar.queuedCount + grammar.scanningCount}</div>
            </div>
          </div>

          <div className={`mt-4 space-y-1 text-sm ${mutedTextClass}`}>
            <div>
              {grammar.activeMiningLabel ? (
                <>
                  Active mining: <span className="font-medium text-[color:var(--ui-text)]">{grammar.activeMiningLabel}</span>
                </>
              ) : (
                "No active grammar mining task."
              )}
            </div>
            <div>
              {grammar.errorCount > 0
                ? `${grammar.errorCount} grammar item${grammar.errorCount === 1 ? "" : "s"} need attention.`
                : "No grammar mining errors in the current focus set."}
            </div>
            <div>
              {grammar.lastTrackedAt
                ? `Grammar tracked ${new Date(grammar.lastTrackedAt).toLocaleString()}`
                : "Open this dashboard after marking grammar known to track known-gain over time."}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/grammar"
              className={buttonPrimaryClass}
            >
              Open grammar
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

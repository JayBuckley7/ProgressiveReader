import type { JlptCatalogTest, JlptLevel, LevelReadinessState } from "@features/jlpt/types";
import { formatJlptTestTitle } from "@features/jlpt/services/jlptConfig";
import { getLevelReadinessSummary } from "@features/jlpt/services/jlptSelectors";

const cardClass = "app-card rounded-md";
const buttonMutedClass = "app-button-muted h-9 rounded-md px-3 text-sm font-medium transition-colors";
const buttonPrimaryClass =
  "app-button-primary h-9 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const mutedTextClass = "text-[color:var(--ui-muted)]";

export function JlptLevelFolder(props: {
  level: JlptLevel;
  tests: JlptCatalogTest[];
  levelState: LevelReadinessState;
  collapsed: boolean;
  isActiveGoal: boolean;
  loadingTest: boolean;
  onToggleCollapsed: (level: JlptLevel) => void;
  onOpenReadiness: (level: JlptLevel) => void;
  onSelectTest: (test: JlptCatalogTest) => void;
}) {
  const { collapsed, isActiveGoal, level, levelState, loadingTest, onOpenReadiness, onSelectTest, onToggleCollapsed, tests } = props;
  const readiness = getLevelReadinessSummary(levelState);

  return (
    <section className={`${cardClass} p-4`}>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[color:var(--ui-text)]">{level}</h3>
            {isActiveGoal && <span className="rounded-md border border-[color:var(--ui-accent)]/35 bg-[color:var(--ui-surface-alt)] px-2 py-1 text-xs font-semibold text-[color:var(--ui-accent)]">Active goal</span>}
          </div>
          <div className={`mt-1 text-sm ${mutedTextClass}`}>
            {tests.length} tests
            {levelState.bindings.length > 0 && (
              <span> · JPDB {readiness.total > 0 ? `${readiness.known}/${readiness.total} (${readiness.percent}%)` : `${levelState.bindings.length} deck${levelState.bindings.length === 1 ? "" : "s"}`}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onOpenReadiness(level)}
            className={buttonMutedClass}
          >
            JPDB readiness
          </button>
          <button
            type="button"
            onClick={() => onToggleCollapsed(level)}
            className={buttonMutedClass}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {tests.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {tests.map((test) => (
                <div key={`${test.source}-${test.id}`} className="rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h4 className="font-semibold text-[color:var(--ui-text)]">{formatJlptTestTitle(test.name)}</h4>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        test.source === "library" ? "border border-sky-500/30 bg-sky-500/10 text-sky-300" : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      }`}
                    >
                      {test.source === "library" ? "Library" : "Local"}
                    </span>
                  </div>
                  <p className={`text-sm ${mutedTextClass}`}>
                    {test.source === "library" ? "From Google Drive library" : "From local test folder"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectTest(test)}
                      disabled={loadingTest}
                      className={buttonPrimaryClass}
                    >
                      Open test
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={`rounded-md border border-dashed border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] p-4 text-sm ${mutedTextClass}`}>
              No test JSON in this folder yet. Readiness tracking can still stay active here.
            </div>
          )}
        </>
      )}
    </section>
  );
}

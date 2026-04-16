import type { JlptCatalogTest, JlptLevel, LevelReadinessState } from "@features/jlpt/types";
import { getLevelReadinessSummary } from "@features/jlpt/services/jlptSelectors";

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
    <section className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-950">{level}</h3>
            {isActiveGoal && <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">Active goal</span>}
          </div>
          <div className="mt-1 text-sm text-gray-500">
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
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            JPDB readiness
          </button>
          <button
            type="button"
            onClick={() => onToggleCollapsed(level)}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
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
                <div key={`${test.source}-${test.id}`} className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h4 className="font-semibold text-gray-800">{test.name.replace(/\.json$/i, "")}</h4>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        test.source === "library" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
                      }`}
                    >
                      {test.source === "library" ? "Library" : "Local"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {test.source === "library" ? "From Google Drive library" : "From local test folder"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectTest(test)}
                      disabled={loadingTest}
                      className="h-9 rounded-md border border-gray-950 bg-gray-950 px-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Open test
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
              No test JSON in this folder yet. Readiness tracking can still stay active here.
            </div>
          )}
        </>
      )}
    </section>
  );
}

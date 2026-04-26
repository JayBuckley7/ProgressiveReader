import type { JlptResultV2 } from "@features/jlpt/types";

export function ResultTrendGraph({ results }: { results: JlptResultV2[] }) {
  const examResults = [...results]
    .filter((result) => result.mode === "exam" && result.scope === "full_test")
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
    .slice(-8);
  const width = 640;
  const height = 220;
  const padding = 34;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const points = examResults.map((result, index) => {
    const x = examResults.length === 1 ? width / 2 : padding + (index / (examResults.length - 1)) * plotWidth;
    const y = padding + ((100 - result.percent) / 100) * plotHeight;
    return { x, y, result };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const latest = examResults[examResults.length - 1];
  const gridColor = "var(--ui-border)";
  const lineColor = "var(--ui-accent)";
  const pointColor = "var(--ui-accent)";

  return (
    <div className="app-card rounded-md p-4 md:col-span-3">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[color:var(--ui-text)]">Exam percentage over time</h3>
          <p className="text-sm text-[color:var(--ui-muted)]">Completed Exam Mode attempts only</p>
        </div>
        {latest && (
          <div className="text-left sm:text-right">
            <div className="text-2xl font-semibold text-[color:var(--ui-text)]">{latest.percent}%</div>
            <div className="text-xs text-[color:var(--ui-muted)]">{latest.level} latest</div>
          </div>
        )}
      </div>

      {examResults.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] text-center">
          <div>
            <div className="font-semibold text-[color:var(--ui-text)]">No exam results yet</div>
            <div className="mt-1 text-sm text-[color:var(--ui-muted)]">Finish an Exam Mode test to start the trend.</div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label="Exam percentage over time">
            {[0, 50, 100].map((tick) => {
              const y = padding + ((100 - tick) / 100) * plotHeight;
              return (
                <g key={tick}>
                  <line x1={padding} x2={width - padding} y1={y} y2={y} stroke={gridColor} strokeWidth="1" />
                  <text x="6" y={y + 4} fill="var(--ui-muted)" fontSize="11">{tick}%</text>
                </g>
              );
            })}
            {line && <polyline points={line} fill="none" stroke={lineColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
            {points.map((point) => (
              <g key={point.result.id}>
                <circle cx={point.x} cy={point.y} r="6" fill={pointColor} />
                <circle cx={point.x} cy={point.y} r="10" fill={pointColor} opacity="0.14" />
              </g>
            ))}
          </svg>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {examResults.slice(-2).map((result) => (
              <div key={result.id} className="rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] p-3 text-sm">
                <div className="font-semibold text-[color:var(--ui-text)]">{result.testName}</div>
                <div className="text-[color:var(--ui-muted)]">
                  {new Date(result.completedAt).toLocaleDateString()} · {result.percent}% · {result.correct}/{result.total}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

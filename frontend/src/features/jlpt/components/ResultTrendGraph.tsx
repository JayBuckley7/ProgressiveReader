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

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 md:col-span-3">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-950">Exam percentage over time</h3>
          <p className="text-sm text-gray-500">Completed Exam Mode attempts only</p>
        </div>
        {latest && (
          <div className="text-left sm:text-right">
            <div className="text-2xl font-semibold text-gray-950">{latest.percent}%</div>
            <div className="text-xs text-gray-500">{latest.level} latest</div>
          </div>
        )}
      </div>

      {examResults.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-center">
          <div>
            <div className="font-semibold text-gray-800">No exam results yet</div>
            <div className="mt-1 text-sm text-gray-500">Finish an Exam Mode test to start the trend.</div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label="Exam percentage over time">
            {[0, 50, 100].map((tick) => {
              const y = padding + ((100 - tick) / 100) * plotHeight;
              return (
                <g key={tick}>
                  <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                  <text x="6" y={y + 4} className="fill-gray-400 text-[11px]">{tick}%</text>
                </g>
              );
            })}
            {line && <polyline points={line} fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
            {points.map((point) => (
              <g key={point.result.id}>
                <circle cx={point.x} cy={point.y} r="6" fill="#16a34a" />
                <circle cx={point.x} cy={point.y} r="10" fill="#16a34a" opacity="0.14" />
              </g>
            ))}
          </svg>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {examResults.slice(-2).map((result) => (
              <div key={result.id} className="rounded-md bg-gray-50 p-3 text-sm">
                <div className="font-semibold text-gray-900">{result.testName}</div>
                <div className="text-gray-500">
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

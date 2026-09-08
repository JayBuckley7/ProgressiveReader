import type { VocabularyStats } from "./types";

export function VocabularyStatsCards({
  t,
  stats,
}: {
  t: (key: string) => string;
  stats: VocabularyStats;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <div className="app-card p-3 text-center">
        <div className="text-xl font-semibold">{stats.total}</div>
        <div className="text-xs app-muted">{t("vocabulary.stats.total")}</div>
      </div>
      <div className="app-card p-3 text-center">
        <div className="text-xl font-semibold">{stats.mastered}</div>
        <div className="text-xs app-muted">{t("vocabulary.stats.mastered")}</div>
      </div>
      <div className="app-card p-3 text-center">
        <div className="text-xl font-semibold">{stats.learning}</div>
        <div className="text-xs app-muted">{t("vocabulary.stats.learning")}</div>
      </div>
    </div>
  );
}


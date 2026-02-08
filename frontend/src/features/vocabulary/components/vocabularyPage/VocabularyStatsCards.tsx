import type { VocabularyStats } from "./types";

export function VocabularyStatsCards({
  t,
  stats,
}: {
  t: (key: string) => string;
  stats: VocabularyStats;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
        <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
        <div className="text-gray-600 dark:text-gray-400">{t("vocabulary.stats.total")}</div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
        <div className="text-3xl font-bold text-green-600">{stats.mastered}</div>
        <div className="text-gray-600 dark:text-gray-400">{t("vocabulary.stats.mastered")}</div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
        <div className="text-3xl font-bold text-orange-600">{stats.learning}</div>
        <div className="text-gray-600 dark:text-gray-400">{t("vocabulary.stats.learning")}</div>
      </div>
    </div>
  );
}


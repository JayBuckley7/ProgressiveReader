import type { FilterMastered } from "./types";

export function VocabularyControlsBar({
  t,
  searchTerm,
  setSearchTerm,
  selectedLanguage,
  setSelectedLanguage,
  languages,
  filterMastered,
  setFilterMastered,
  onAddWord,
  canAdd,
}: {
  t: (key: string) => string;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedLanguage: string;
  setSelectedLanguage: (v: string) => void;
  languages: string[];
  filterMastered: FilterMastered;
  setFilterMastered: (v: FilterMastered) => void;
  onAddWord: () => void;
  canAdd: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder={t("vocabulary.controls.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
          />

          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
          >
            <option value="">{t("vocabulary.controls.allLanguages")}</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          <select
            value={filterMastered}
            onChange={(e) => setFilterMastered(e.target.value as FilterMastered)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
          >
            <option value="all">{t("vocabulary.controls.filterAll")}</option>
            <option value="learning">{t("vocabulary.controls.filterLearning")}</option>
            <option value="mastered">{t("vocabulary.controls.filterMastered")}</option>
          </select>
        </div>

        <button
          onClick={onAddWord}
          disabled={!canAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("vocabulary.controls.addWord")}
        </button>
      </div>
    </div>
  );
}


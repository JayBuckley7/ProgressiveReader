import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "@clerk/clerk-react";
import { useAppData } from "@shared/contexts/AppDataContext";

import { AddWordModal } from "./vocabularyPage/AddWordModal";
import { DeckPanel } from "./vocabularyPage/DeckPanel";
import { DueCardsPanel } from "./vocabularyPage/DueCardsPanel";
import { UserVocabularyList } from "./vocabularyPage/UserVocabularyList";
import { VocabularyControlsBar } from "./vocabularyPage/VocabularyControlsBar";
import { VocabularyStatsCards } from "./vocabularyPage/VocabularyStatsCards";
import { useJpdbDeckVocabulary } from "./vocabularyPage/hooks/useJpdbDeckVocabulary";
import { useUserVocabulary } from "./vocabularyPage/hooks/useUserVocabulary";
import type { FilterMastered } from "./vocabularyPage/types";

export function VocabularyPage() {
  const { t } = useTranslation();
  const { isSignedIn } = useUser();
  const { books } = useAppData();

  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMastered, setFilterMastered] = useState<FilterMastered>("all");

  const userVocab = useUserVocabulary({
    isSignedIn: Boolean(isSignedIn),
    selectedLanguage,
    filterMastered,
    searchTerm,
  });

  const deckVocab = useJpdbDeckVocabulary({
    isSignedIn: Boolean(isSignedIn),
    searchTerm,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 dark:text-gray-200">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {t("vocabulary.header.title")}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">{t("vocabulary.header.subtitle")}</p>
      </div>

      <VocabularyStatsCards t={t} stats={userVocab.stats} />

      <DueCardsPanel
        t={t}
        selectedDeckId={deckVocab.selectedDeckId}
        selectedDeckName={deckVocab.selectedDeckName}
        dueVocabEntries={deckVocab.dueVocabEntries}
        dueVocabError={deckVocab.dueVocabError}
        dueVocabProgress={deckVocab.dueVocabProgress}
        isSignedIn={Boolean(isSignedIn)}
        isLoadingDueVocab={deckVocab.isLoadingDueVocab}
        onRefresh={deckVocab.refreshDueCards}
      />

      <DeckPanel
        t={t}
        isSignedIn={Boolean(isSignedIn)}
        selectedDeckId={deckVocab.selectedDeckId}
        onDeckSelect={deckVocab.selectDeck}
        onOpenDeck={deckVocab.openSelectedDeck}
        onLoadMore={deckVocab.loadMoreDeckVocabulary}
        deckVocabPairs={deckVocab.deckVocabPairs}
        deckVocabEntries={deckVocab.deckVocabEntries}
        deckVocabError={deckVocab.deckVocabError}
        isLoadingDeckVocab={deckVocab.isLoadingDeckVocab}
        groupedDeckVocabulary={deckVocab.groupedDeckVocabulary}
      />

      <VocabularyControlsBar
        t={t}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedLanguage={selectedLanguage}
        setSelectedLanguage={setSelectedLanguage}
        languages={userVocab.languages}
        filterMastered={filterMastered}
        setFilterMastered={setFilterMastered}
        onAddWord={() => setShowAddForm(true)}
        canAdd={Boolean(isSignedIn)}
      />

      <UserVocabularyList
        t={t}
        isSignedIn={Boolean(isSignedIn)}
        vocabError={userVocab.vocabError}
        isLoadingVocabulary={userVocab.isLoadingVocabulary}
        vocabulary={userVocab.vocabulary}
        filteredVocabulary={userVocab.filteredVocabulary}
        books={books}
        onToggleMastered={userVocab.handleToggleMastered}
      />

      {showAddForm && (
        <AddWordModal
          onClose={() => setShowAddForm(false)}
          onAdded={async () => {
            await userVocab.loadVocabulary();
            setShowAddForm(false);
          }}
          books={books}
        />
      )}
    </div>
  );
}

export default VocabularyPage;

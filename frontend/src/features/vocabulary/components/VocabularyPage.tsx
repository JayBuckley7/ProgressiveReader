import { useState, useEffect } from "react";
import { fetchDueCards, addVocabularyWord, getUserVocabulary, toggleMastered as toggleMasteredApi, type VocabularyWord as ApiVocabularyWord } from "@features/vocabulary/services/vocabApi";
import { toast } from "sonner";
import { BookmarkletHelper } from "./BookmarkletHelper";
import { DeckSelector } from "./DeckSelector";
import { useTranslation } from "react-i18next";
import type { DueCard } from "~/types/api";

interface VocabularyWord {
  _id: string; // Was: Id<"vocabulary">
  word: string;
  translation: string;
  language: string;
  bookId?: string; // Was: Id<"books">
  context?: string;
  difficulty?: "easy" | "medium" | "hard";
  mastered: boolean;
  _creationTime: number;
}

export function VocabularyPage() {
  const { t } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMastered, setFilterMastered] = useState<"all" | "mastered" | "learning">("all");

  const [dueCards, setDueCards] = useState<DueCard[]>([]);
  const [showBookmarkletHelper, setShowBookmarkletHelper] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [vocabulary, setVocabulary] = useState<VocabularyWord[]>([]);
  const [isLoadingVocabulary, setIsLoadingVocabulary] = useState(false);
  const books: any[] = []; // TODO: Load books from backend if needed

  const CACHE_KEY = "jpdb_due_cards";
  const CACHE_TIMESTAMP_KEY = "jpdb_due_cards_ts";
  const CACHE_VALID_MS = 24 * 60 * 60 * 1000;

  const loadCachedCards = () => {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return null;
    if (Date.now() - Number(timestamp) > CACHE_VALID_MS) {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
      return null;
    }
    const payload = localStorage.getItem(CACHE_KEY);
    return payload ? (JSON.parse(payload) as DueCard[]) : null;
  };

  const saveCachedCards = (cards: DueCard[]) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cards));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
  };

  const languages = Array.from(new Set(vocabulary.map(word => word.language)));
  const filteredVocabulary = vocabulary.filter(word => {
    const matchesSearch = word.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         word.translation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMastered = filterMastered === "all" || 
                           (filterMastered === "mastered" && word.mastered) ||
                           (filterMastered === "learning" && !word.mastered);
    return matchesSearch && matchesMastered;
  });

  const handleFetchDueCards = async () => {
    try {
      const jpdbUsername = localStorage.getItem('jpdbUsername') || '';
      const jpdbPassword = localStorage.getItem('jpdbPassword') || '';
      const jpdbCookie = localStorage.getItem('jpdbCookie') || '';
      if (!jpdbUsername && !jpdbPassword && !jpdbCookie) {
        setShowBookmarkletHelper(true);
        return;
      }
      const cards = await fetchDueCards({
        username: jpdbUsername || undefined,
        password: jpdbPassword || undefined,
        cookie: jpdbCookie || undefined,
      });
      setDueCards(cards);
      saveCachedCards(cards);
      toast.success(t('vocabulary.dueCards.fetched', { count: cards.length }));
    } catch (err: any) {
      console.error('Failed to fetch due cards', err);
      if (err.message === 'JPDB_CREDENTIALS_MISSING') {
        toast.error('JPDB credentials not configured. Please check settings.');
      } else if (err.message.includes('401') || err.message.includes('Authentication')) {
        toast.error('JPDB authentication failed. Please check your credentials in settings.');
      } else {
        toast.error('Failed to fetch due cards. Please try again or check your connection.');
      }
    }
  };

  const handleCookieExtracted = (cookie: string) => {
    localStorage.setItem('jpdbCookie', cookie);
    setShowBookmarkletHelper(false);
    toast.success('JPDB cookie saved! Now fetching due cards...');
    setTimeout(() => {
      handleFetchDueCards();
    }, 500);
  };

  useEffect(() => {
    const cached = loadCachedCards();
    if (cached) {
      setDueCards(cached);
    }
    
    // Load vocabulary from backend
    loadVocabulary();
  }, []);

  const loadVocabulary = async () => {
    setIsLoadingVocabulary(true);
    try {
      const vocab = await getUserVocabulary({
        language: selectedLanguage || undefined,
        mastered: filterMastered === "all" ? undefined : filterMastered === "mastered",
      });
      // Convert API format to component format
      const convertedVocab: VocabularyWord[] = vocab.map((v: ApiVocabularyWord) => ({
        _id: v.id,
        word: v.word,
        translation: v.translation,
        language: v.language,
        bookId: v.bookId || undefined,
        context: v.context || undefined,
        difficulty: v.difficulty as "easy" | "medium" | "hard" | undefined,
        mastered: v.mastered,
        _creationTime: v.createdAt ? new Date(v.createdAt).getTime() : Date.now(),
      }));
      setVocabulary(convertedVocab);
    } catch (error) {
      console.error('Failed to load vocabulary:', error);
      // Don't show error toast for initial load - vocabulary might be empty
    } finally {
      setIsLoadingVocabulary(false);
    }
  };

  useEffect(() => {
    loadVocabulary();
  }, [selectedLanguage, filterMastered]);

  const handleToggleMastered = async (wordId: string) => {
    try {
      const word = vocabulary.find(w => w._id === wordId);
      if (!word) return;
      
      const updatedWord = await toggleMasteredApi(wordId, !word.mastered);
      // Update local state
      setVocabulary(prev => prev.map(w => 
        w._id === wordId 
          ? { ...w, mastered: updatedWord.mastered }
          : w
      ));
      toast.success(`Word marked as ${updatedWord.mastered ? 'mastered' : 'learning'}`);
    } catch (error) {
      toast.error("Failed to update word status");
      console.error(error);
    }
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case "easy": return "bg-green-100 text-green-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "hard": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const stats = {
    total: vocabulary.length,
    mastered: vocabulary.filter(w => w.mastered).length,
    learning: vocabulary.filter(w => !w.mastered).length,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 dark:text-gray-200">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t('vocabulary.header.title')}</h1>
        <p className="text-gray-600 dark:text-gray-400">{t('vocabulary.header.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-gray-600 dark:text-gray-400">{t('vocabulary.stats.total')}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
          <div className="text-3xl font-bold text-green-600">{stats.mastered}</div>
          <div className="text-gray-600 dark:text-gray-400">{t('vocabulary.stats.mastered')}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 text-center">
          <div className="text-3xl font-bold text-orange-600">{stats.learning}</div>
          <div className="text-gray-600 dark:text-gray-400">{t('vocabulary.stats.learning')}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">{t('vocabulary.dueCards.title')}</h2>
        {dueCards.length > 0 ? (
          <ul className="grid gap-2 mb-4">
            {dueCards.map(card => (
              <li key={card.id} className="flex justify-between">
                <span>{card.term}</span>
                <span className="text-gray-600 dark:text-gray-300">{card.meaning}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600 dark:text-gray-400 mb-4">{t('vocabulary.dueCards.none')}</p>
        )}
        <button
          onClick={handleFetchDueCards}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          {t('vocabulary.dueCards.fetch')}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">{t('vocabulary.decks.title')}</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{t('vocabulary.decks.description')}</p>
        <DeckSelector 
          selectedDeckId={selectedDeckId}
          onDeckSelect={(deck) => {
            setSelectedDeckId(deck.id);
            console.log('Selected deck:', deck);
          }}
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <input
              type="text"
              placeholder={t('vocabulary.controls.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
            />

            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
            >
              <option value="">{t('vocabulary.controls.allLanguages')}</option>
              {languages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>

            <select
              value={filterMastered}
              onChange={(e) => setFilterMastered(e.target.value as "all" | "mastered" | "learning")}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white"
            >
              <option value="all">{t('vocabulary.controls.filterAll')}</option>
              <option value="learning">{t('vocabulary.controls.filterLearning')}</option>
              <option value="mastered">{t('vocabulary.controls.filterMastered')}</option>
            </select>
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {t('vocabulary.controls.addWord')}
          </button>
        </div>
      </div>

      {filteredVocabulary.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {vocabulary.length === 0 ? t('vocabulary.empty.noneYet') : t('vocabulary.empty.noneFound')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {vocabulary.length === 0
              ? t('vocabulary.empty.promptAdd')
              : t('vocabulary.empty.noneFound')
            }
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredVocabulary.map((word) => (
            <VocabularyCard 
              key={word._id} 
              word={word} 
              books={books}
              onToggleMastered={handleToggleMastered}
            />
          ))}
        </div>
      )}

      {showAddForm && (
        <AddWordModal 
          onClose={() => setShowAddForm(false)} 
          books={books}
        />
      )}

      {showBookmarkletHelper && (
        <BookmarkletHelper
          onCookieExtracted={handleCookieExtracted}
          onClose={() => setShowBookmarkletHelper(false)}
        />
      )}
    </div>
  );
}

interface VocabularyCardProps {
  word: VocabularyWord;
  books: any[];
  onToggleMastered: (wordId: string) => void;
}

function VocabularyCard({ word, books, onToggleMastered }: VocabularyCardProps) {
  const book = word.bookId ? books.find(b => b._id === word.bookId) : null;
  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty) {
      case "easy": return "bg-green-100 text-green-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "hard": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{word.word}</h3>
            <span className="text-lg text-gray-600 dark:text-gray-300">→ {word.translation}</span>
            {word.difficulty && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(word.difficulty)}`}>
                {word.difficulty}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {word.language}
            </span>
            {book && (
              <span>📖 {book.title}</span>
            )}
            <span>{new Date(word._creationTime).toLocaleDateString()}</span>
          </div>
          {word.context && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{word.context}"</p>
            </div>
          )}
        </div>
        <button
          onClick={() => onToggleMastered(word._id)}
          className={`ml-4 px-4 py-2 rounded-lg font-medium transition-colors ${
            word.mastered
              ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-100 dark:hover:bg-green-800"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          {word.mastered ? "✓ Mastered" : "Learning"}
        </button>
      </div>
    </div>
  );
}

interface AddWordModalProps {
  onClose: () => void;
  books: any[];
}

function AddWordModal({ onClose, books }: AddWordModalProps) {
  const { t } = useTranslation();
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [language, setLanguage] = useState("English");
  const [bookId, setBookId] = useState("");
  const [context, setContext] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !translation.trim()) {
      toast.error("Word and translation are required");
      return;
    }
    setIsSubmitting(true);
    try {
      await addVocabularyWord({
        word: word.trim(),
        translation: translation.trim(),
        language,
        bookId: bookId || undefined,
        context: context.trim() || undefined,
        difficulty: difficulty || undefined,
      });
      toast.success("Word added successfully!");
      onClose();
    } catch (error) {
      toast.error("Failed to add word");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full max-height-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('vocabulary.addModal.title')}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">✕</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocabulary.addModal.labels.word')}</label>
              <input type="text" value={word} onChange={(e) => setWord(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white" placeholder={t('vocabulary.addModal.placeholders.word')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocabulary.addModal.labels.translation')}</label>
              <input type="text" value={translation} onChange={(e) => setTranslation(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white" placeholder={t('vocabulary.addModal.placeholders.translation')} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocabulary.addModal.labels.language')}</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white">
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="Chinese">Chinese</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocabulary.addModal.labels.book')}</label>
              <select value={bookId} onChange={(e) => setBookId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white">
                <option value="">{t('vocabulary.addModal.placeholders.selectBook')}</option>
                {books.map(book => (
                  <option key={book._id} value={book._id}>{book.title} - {book.author}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocabulary.addModal.labels.difficulty')}</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard" | "")} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none dark:bg-gray-700 dark:text-white">
                <option value="">{t('vocabulary.addModal.placeholders.selectDifficulty')}</option>
                <option value="easy">{t('vocabulary.addModal.difficultyOptions.easy')}</option>
                <option value="medium">{t('vocabulary.addModal.difficultyOptions.medium')}</option>
                <option value="hard">{t('vocabulary.addModal.difficultyOptions.hard')}</option>
              </select>
            </div>
            <div>
              <label className="block text.sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocabulary.addModal.labels.context')}</label>
              <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none dark:bg-gray-700 dark:text-white" placeholder={t('vocabulary.addModal.placeholders.context')} />
            </div>
            <div className="flex space-x-3 pt-4">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">{t('vocabulary.addModal.buttons.cancel')}</button>
              <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmitting ? t('vocabulary.addModal.buttons.submitting') : t('vocabulary.addModal.buttons.submit')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default VocabularyPage;



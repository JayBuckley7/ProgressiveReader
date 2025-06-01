import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../../convex/_generated/dataModel";

interface VocabularyWord {
  _id: Id<"vocabulary">;
  word: string;
  translation: string;
  language: string;
  bookId?: Id<"books">;
  context?: string;
  difficulty?: "easy" | "medium" | "hard";
  mastered: boolean;
  _creationTime: number;
}

export function VocabularyPage() {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMastered, setFilterMastered] = useState<"all" | "mastered" | "learning">("all");

  const vocabulary = useQuery(api.vocabulary.list, { 
    language: selectedLanguage || undefined 
  }) || [];

  const books = useQuery(api.books.list) || [];
  const toggleMastered = useMutation(api.vocabulary.toggleMastered);

  // Get unique languages from vocabulary
  const languages = Array.from(new Set(vocabulary.map(word => word.language)));

  // Filter vocabulary based on search and mastered status
  const filteredVocabulary = vocabulary.filter(word => {
    const matchesSearch = word.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         word.translation.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMastered = filterMastered === "all" || 
                           (filterMastered === "mastered" && word.mastered) ||
                           (filterMastered === "learning" && !word.mastered);
    
    return matchesSearch && matchesMastered;
  });

  const handleToggleMastered = async (wordId: Id<"vocabulary">) => {
    try {
      await toggleMastered({ wordId });
    } catch (error) {
      toast.error("Failed to update word status");
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">📝 Vocabulary</h1>
        <p className="text-gray-600">Track and review your language learning progress</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border p-6 text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-gray-600">Total Words</div>
        </div>
        <div className="bg-white rounded-lg border p-6 text-center">
          <div className="text-3xl font-bold text-green-600">{stats.mastered}</div>
          <div className="text-gray-600">Mastered</div>
        </div>
        <div className="bg-white rounded-lg border p-6 text-center">
          <div className="text-3xl font-bold text-orange-600">{stats.learning}</div>
          <div className="text-gray-600">Learning</div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <input
              type="text"
              placeholder="Search words..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />

            {/* Language Filter */}
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="">All Languages</option>
              {languages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>

            {/* Mastered Filter */}
            <select
              value={filterMastered}
              onChange={(e) => setFilterMastered(e.target.value as "all" | "mastered" | "learning")}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="all">All Words</option>
              <option value="learning">Learning</option>
              <option value="mastered">Mastered</option>
            </select>
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            + Add Word
          </button>
        </div>
      </div>

      {/* Vocabulary List */}
      {filteredVocabulary.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {vocabulary.length === 0 ? "No vocabulary yet" : "No words found"}
          </h2>
          <p className="text-gray-600 mb-6">
            {vocabulary.length === 0 
              ? "Start adding words as you read to build your vocabulary"
              : "Try adjusting your search or filters"
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

      {/* Add Word Modal */}
      {showAddForm && (
        <AddWordModal 
          onClose={() => setShowAddForm(false)}
          books={books}
        />
      )}
    </div>
  );
}

interface VocabularyCardProps {
  word: VocabularyWord;
  books: any[];
  onToggleMastered: (wordId: Id<"vocabulary">) => void;
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
    <div className="bg-white rounded-lg border p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-gray-900">{word.word}</h3>
            <span className="text-lg text-gray-600">→ {word.translation}</span>
            {word.difficulty && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(word.difficulty)}`}>
                {word.difficulty}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {word.language}
            </span>
            {book && (
              <span>📖 {book.title}</span>
            )}
            <span>{new Date(word._creationTime).toLocaleDateString()}</span>
          </div>

          {word.context && (
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700 italic">"{word.context}"</p>
            </div>
          )}
        </div>

        <button
          onClick={() => onToggleMastered(word._id)}
          className={`ml-4 px-4 py-2 rounded-lg font-medium transition-colors ${
            word.mastered
              ? "bg-green-100 text-green-800 hover:bg-green-200"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [language, setLanguage] = useState("English");
  const [bookId, setBookId] = useState("");
  const [context, setContext] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addWord = useMutation(api.vocabulary.addWord);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !translation.trim()) {
      toast.error("Word and translation are required");
      return;
    }

    setIsSubmitting(true);
    try {
      await addWord({
        word: word.trim(),
        translation: translation.trim(),
        language,
        bookId: bookId ? bookId as Id<"books"> : undefined,
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
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Add New Word</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Word *
              </label>
              <input
                type="text"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Enter the word"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Translation *
              </label>
              <input
                type="text"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Enter the translation"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Book (Optional)
              </label>
              <select
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Select a book</option>
                {books.map(book => (
                  <option key={book._id} value={book._id}>
                    {book.title} - {book.author}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard" | "")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">Select difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Context (Optional)
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                placeholder="Sentence or context where you found this word"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Adding..." : "Add Word"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Toaster } from "sonner";
import BookLibrary from "./components/BookLibrary";
import { BookReader } from "./components/BookReader";
import { SettingsProvider } from "./contexts/SettingsContext";
import { TopActions } from "./components/TopActions";
import { HeroBanner } from "./components/HeroBanner";
import { DangerZone } from "./components/DangerZone";
import { Footer } from "./components/Footer";
import { VocabularyPage } from "./components/VocabularyPage";

export default function App() {
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [currentPage, setCurrentPage] = useState<"library" | "vocabulary" | "stats">("library");

  return (
    <SettingsProvider>
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <main className="flex-1 flex flex-col">
          <div className="flex flex-col flex-1">
            <TopActions currentPage={currentPage} onPageChange={setCurrentPage} />
            <HeroBanner />
            <div className="flex-1 overflow-y-auto">
              {currentBookId ? (
                <BookReader
                  bookId={currentBookId}
                  currentChapter={currentChapter}
                  setCurrentChapter={setCurrentChapter}
                  onBack={() => setCurrentBookId(null)}
                />
              ) : currentPage === "library" ? (
                <BookLibrary onSelectBook={setCurrentBookId} />
              ) : currentPage === "vocabulary" ? (
                <VocabularyPage />
              ) : (
                <div className="p-8 text-center">
                  <h2 className="text-2xl font-bold mb-4">Reading Statistics</h2>
                  <p className="text-gray-600">Stats page coming soon...</p>
                </div>
              )}
            </div>
          </div>
        </main>
        <Footer />
        <DangerZone />
        <Toaster />
      </div>
    </SettingsProvider>
  );
}

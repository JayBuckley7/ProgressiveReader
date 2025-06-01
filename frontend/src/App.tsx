import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { BookLibrary } from "./components/BookLibrary";
import { BookReader } from "./components/BookReader";
import { SettingsProvider } from "./contexts/SettingsContext";
import { useState } from "react";
import { TopActions } from "./components/TopActions";
import { HeroBanner } from "./components/HeroBanner";
import { DangerZone } from "./components/DangerZone";
import { VocabularyPage } from "./components/VocabularyPage";
import { LoginModal } from "./components/LoginModal";
import { Id } from "../convex/_generated/dataModel";

export default function App() {
  const [currentBookId, setCurrentBookId] = useState<Id<"books"> | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [currentPage, setCurrentPage] = useState<"library" | "vocabulary" | "stats">("library");
  const [showLogin, setShowLogin] = useState(false);

  return (
    <SettingsProvider>
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        {currentBookId ? (
          <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold text-primary">ProgReader</h2>
              <button
                onClick={() => setCurrentBookId(null)}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary"
              >
                ← Back to Library
              </button>
            </div>
            <SignOutButton />
          </header>
        ) : (
          null
        )}
        
        <main className="flex-1">
          <Content
            currentBookId={currentBookId}
            setCurrentBookId={setCurrentBookId}
            currentChapter={currentChapter}
            setCurrentChapter={setCurrentChapter}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            setShowLogin={setShowLogin}
          />
        </main>
        <DangerZone />

        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
        
        <Toaster />
      </div>
    </SettingsProvider>
  );
}

function Content({
  currentBookId,
  setCurrentBookId,
  currentChapter,
  setCurrentChapter,
  currentPage,
  setCurrentPage,
  setShowLogin,
}: {
  currentBookId: Id<"books"> | null;
  setCurrentBookId: (id: Id<"books"> | null) => void;
  currentChapter: number;
  setCurrentChapter: (chapter: number) => void;
  currentPage: "library" | "vocabulary" | "stats";
  setCurrentPage: (page: "library" | "vocabulary" | "stats") => void;
  setShowLogin: (show: boolean) => void;
}) {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Authenticated>
        {currentBookId ? (
          <BookReader
            bookId={currentBookId}
            currentChapter={currentChapter}
            setCurrentChapter={setCurrentChapter}
          />
        ) : (
          <>
            <TopActions
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onShowLogin={() => setShowLogin(true)}
            />
            <HeroBanner />
            {currentPage === "library" ? (
              <BookLibrary onSelectBook={setCurrentBookId} />
            ) : (
              <VocabularyPage />
            )}
          </>
        )}
      </Authenticated>
      
      <Unauthenticated>
        <HeroBanner />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-full max-w-md mx-auto p-8">
            <SignInForm />
          </div>
        </div>
      </Unauthenticated>
    </div>
  );
}

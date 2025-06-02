import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import BookLibrary from "./components/BookLibrary";
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
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <main className="flex-1 flex flex-col">
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
      <div className="flex-1 flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <Authenticated>
        {currentBookId ? (
          <BookReader
            bookId={currentBookId}
            currentChapter={currentChapter}
            setCurrentChapter={setCurrentChapter}
            onBack={() => setCurrentBookId(null)}
          />
        ) : (
          <div className="flex flex-col flex-1">
            <TopActions
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onShowLogin={() => setShowLogin(true)}
            />
            <HeroBanner />
            <div className="flex-1 overflow-y-auto">
              {currentPage === "library" ? (
                <BookLibrary onSelectBook={setCurrentBookId} />
              ) : (
                <VocabularyPage />
              )}
            </div>
          </div>
        )}
      </Authenticated>
      
      <Unauthenticated>
        <div className="flex flex-col flex-1">
          <HeroBanner />
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-md mx-auto">
              <SignInForm />
            </div>
          </div>
        </div>
      </Unauthenticated>
    </div>
  );
}

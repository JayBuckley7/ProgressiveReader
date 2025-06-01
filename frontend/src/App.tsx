import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { BookLibrary } from "./components/BookLibrary";
import { BookReader } from "./components/BookReader";
import { SettingsProvider } from "./contexts/SettingsContext";
import { useState } from "react";
import { Id } from "../convex/_generated/dataModel";

export default function App() {
  const [currentBookId, setCurrentBookId] = useState<Id<"books"> | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);

  return (
    <SettingsProvider>
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-primary">ProgReader</h2>
            {currentBookId && (
              <button
                onClick={() => setCurrentBookId(null)}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary"
              >
                ← Back to Library
              </button>
            )}
          </div>
          <SignOutButton />
        </header>
        
        <main className="flex-1">
          <Content 
            currentBookId={currentBookId}
            setCurrentBookId={setCurrentBookId}
            currentChapter={currentChapter}
            setCurrentChapter={setCurrentChapter}
          />
        </main>
        
        <Toaster />
      </div>
    </SettingsProvider>
  );
}

function Content({ 
  currentBookId, 
  setCurrentBookId, 
  currentChapter, 
  setCurrentChapter 
}: {
  currentBookId: Id<"books"> | null;
  setCurrentBookId: (id: Id<"books"> | null) => void;
  currentChapter: number;
  setCurrentChapter: (chapter: number) => void;
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
          <BookLibrary onSelectBook={setCurrentBookId} />
        )}
      </Authenticated>
      
      <Unauthenticated>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-full max-w-md mx-auto p-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-primary mb-4">ProgReader</h1>
              <p className="text-xl text-gray-600 dark:text-gray-400">
                Your personal book reader with Japanese learning features
              </p>
            </div>
            <SignInForm />
          </div>
        </div>
      </Unauthenticated>
    </div>
  );
}

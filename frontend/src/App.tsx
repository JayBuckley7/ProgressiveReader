import { useState, useEffect } from "react";
import { prefetchDueCards } from "./services/dueCardsService";
import { ClerkProvider, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";

import { SignInForm } from "./components/SignInForm";
import { Toaster } from "sonner";
import BookLibrary from "./components/BookLibrary";
import { BookReader } from "./components/BookReader";
import { TopActions } from "./components/TopActions";
import { HeroBanner } from "./components/HeroBanner";
import { DangerZone } from "./components/DangerZone";
import { Footer } from "./components/Footer";
import { VocabularyPage } from "./components/VocabularyPage";
import { LoginModal } from "./components/LoginModal";
import { useGoogleDrive } from "./hooks/useGoogleDrive";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { gDriveService } from "./services/gdriveService";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment variables");
}

function App() {
  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <MainApp />
    </ClerkProvider>
  );
}

function MainApp() {
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [currentPage, setCurrentPage] = useState<"library" | "vocabulary" | "stats">(
    "library"
  );
  const [showLogin, setShowLogin] = useState(false);

  const { user: clerkUser, isSignedIn: isClerkSignedIn, isLoaded: isClerkLoaded } = useUser();
  const { isDriveConnected, isLoading: isDriveLoading } = useGoogleDrive();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (isClerkLoaded && isClerkSignedIn && clerkUser && !isDriveLoading) {
      const wasGoogleClerkLogin = clerkUser.externalAccounts?.some(
        (acc) => acc.provider.startsWith("google")
      );

      if (wasGoogleClerkLogin && !isDriveConnected && isOnline) {
        console.log(
          "[AppContent] Clerk Google sign-in detected. Google Drive not yet connected. Prompting for Drive auth..."
        );
        gDriveService.signIn('consent');
      }
    }
  }, [
    isClerkLoaded,
    isClerkSignedIn,
    clerkUser,
    isDriveConnected,
    isDriveLoading,
    isOnline,
  ]);

  useEffect(() => {
    if (
      isClerkLoaded &&
      isClerkSignedIn &&
      localStorage.getItem('preferDueCards') === 'true'
    ) {
    }
  }, [isClerkLoaded, isClerkSignedIn]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="flex-1 flex flex-col">
        <SignedIn>
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
          )}
        </SignedIn>

        <SignedOut>
          <div className="flex flex-col flex-1">
            <TopActions
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onShowLogin={() => setShowLogin(true)}
            />
            <HeroBanner />
            <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
              <div className="w-full max-w-md mx-auto">
                <SignInForm />
              </div>
            </div>
          </div>
        </SignedOut>
      </main>
      <Footer />
      <DangerZone />

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      <Toaster />
    </div>
  );
}

export default App;

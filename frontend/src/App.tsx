import { ClerkProvider, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import { useState, useEffect } from "react";
import { Toaster } from "react-hot-toast";
import BookLibrary from "./components/BookLibrary";
import { BookReader } from "./components/BookReader";
import { SettingsProvider, useSettings } from "./contexts/SettingsContext";
import { OnlineStatusProvider, useOnlineStatus } from "./contexts/OnlineStatusContext";
import { TopActions } from "./components/TopActions";
import { HeroBanner } from "./components/HeroBanner";
import VocabularyPage from "./components/VocabularyPage";
import { Footer } from "./components/Footer";
import { DangerZone } from "./components/DangerZone";
import { LoginModal } from "./components/LoginModal";
import { gDriveService } from "./services/gdriveService";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISH_KEY;

if (!clerkPubKey) {
  throw new Error("Missing Publishable Key");
}

function App() {
  return (
    <OnlineStatusProvider>
      <SettingsProvider>
        <ClerkProvider publishableKey={clerkPubKey}>
          <AppContent />
        </ClerkProvider>
      </SettingsProvider>
    </OnlineStatusProvider>
  );
}

function AppContent() {
  const { settings } = useSettings();
  const { isOnline } = useOnlineStatus();
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState("library");
  const [showLogin, setShowLogin] = useState(false);
  const { isSignedIn: isClerkSignedIn } = useUser();

  useEffect(() => {
    gDriveService.init(isClerkSignedIn);
  }, [isClerkSignedIn]);

  return (
    <div className={`App theme-${settings.theme} font-${settings.fontFamily}`} style={{ fontSize: `${settings.fontSize}px` }}>
      <main className="flex flex-col flex-1">
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
            <div className="p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Welcome to Progressive Reader</h2>
              <p className="text-gray-600">Please sign in to access your library.</p>
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

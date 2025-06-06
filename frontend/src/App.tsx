import { useState, useEffect } from "react";
import { ClerkProvider, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";

import { SignInForm } from "./components/SignInForm";
import { SignOutButton } from "./components/SignOutButton"; // This might be unused now, or used inside TopActions
import { Toaster } from "sonner";
import BookLibrary from "./components/BookLibrary";
import { BookReader } from "./components/BookReader";
import { SettingsProvider } from "./contexts/SettingsContext";
import { TopActions } from "./components/TopActions";
import { HeroBanner } from "./components/HeroBanner";
import { DangerZone } from "./components/DangerZone";
import { VocabularyPage } from "./components/VocabularyPage";
import { LoginModal } from "./components/LoginModal";
import { useGoogleDrive } from "./hooks/useGoogleDrive"; // Import the hook

// Get Clerk publishable key from environment variable
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function App() {
  if (!clerkPubKey) {
    throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment variables");
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <AppContent />
    </ClerkProvider>
  );
}

function AppContent() {
    const [current_book_id, set_current_book_id] = useState<string | null>(null); // Was Id<"books">
    const [current_chapter, set_current_chapter] = useState(0);
    const [current_page, set_current_page] = useState<"library" | "vocabulary" | "stats">(
        "library"
    );
    const [show_login, set_show_login] = useState(false);

  // Clerk and Google Drive hooks
  const { user: clerkUser, isSignedIn: isClerkSignedIn, isLoaded: isClerkLoaded } = useUser();
  const { isDriveConnected, connectToDrive, isLoading: isDriveLoading } = useGoogleDrive();

  useEffect(() => {
    // Only proceed if Clerk sign-in is complete, user data is available, and Drive is not already loading.
    if (isClerkLoaded && isClerkSignedIn && clerkUser && !isDriveLoading) {
      // Check if one of the Clerk external accounts is Google
      // The exact provider string ('google', 'google_oauth2', etc.) might depend on your Clerk instance config.
      // Inspect clerkUser.externalAccounts[0].provider to be sure.
      const wasGoogleClerkLogin = clerkUser.externalAccounts?.some(
        (acc) => acc.provider.startsWith("google") // Using startsWith for more flexibility
      );

      if (wasGoogleClerkLogin && !isDriveConnected) {
        console.log(
          "[AppContent] Clerk Google sign-in detected. Google Drive not yet connected. Prompting for Drive auth..."
        );
        // Automatically initiate the Google Drive connection flow.
        // Using 'consent' ensures the user sees the Drive scopes being requested.
        connectToDrive('consent');
      }
    }
  }, [
    isClerkLoaded,
    isClerkSignedIn,
    clerkUser,
    isDriveConnected,
    connectToDrive,
    isDriveLoading,
  ]);

  return (
    <SettingsProvider>
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <main className="flex-1 flex flex-col">
          <Content
            current_book_id={current_book_id}
            set_current_book_id={set_current_book_id}
            current_chapter={current_chapter}
            set_current_chapter={set_current_chapter}
            current_page={current_page}
            set_current_page={set_current_page}
            set_show_login={set_show_login}
          />
        </main>
        <DangerZone />

        {show_login && <LoginModal onClose={() => set_show_login(false)} />}

        <Toaster />
      </div>
    </SettingsProvider>
  );
}

function Content({
  current_book_id,
  set_current_book_id,
  current_chapter,
  set_current_chapter,
  current_page,
  set_current_page,
  set_show_login,
}: {
  current_book_id: string | null; // Was Id<"books">
  set_current_book_id: (id: string | null) => void; // Was Id<"books">
  current_chapter: number;
  set_current_chapter: (chapter: number) => void;
  current_page: "library" | "vocabulary" | "stats";
  set_current_page: (page: "library" | "vocabulary" | "stats") => void;
  set_show_login: (show: boolean) => void;
}) {
  const { user, isLoaded } = useUser();

  // Show loading spinner while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="flex-1 flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <SignedIn>
          {current_book_id ? (
            <BookReader
                bookId={current_book_id}
                currentChapter={current_chapter}
                setCurrentChapter={set_current_chapter}
                onBack={() => set_current_book_id(null)}
            />
        ) : (
          <div className="flex flex-col flex-1">
              <TopActions
                  currentPage={current_page}
                  onPageChange={set_current_page}
                  onShowLogin={() => set_show_login(true)}
              />
            <HeroBanner />
            <div className="flex-1 overflow-y-auto">
              {current_page === "library" ? (
                <BookLibrary onSelectBook={set_current_book_id} />
              ) : current_page === "vocabulary" ? (
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
              currentPage={current_page}
              onPageChange={set_current_page}
              onShowLogin={() => set_show_login(true)}
          />
          <HeroBanner />
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-md mx-auto">
              <SignInForm />
            </div>
          </div>
        </div>
      </SignedOut>
    </div>
  );
}

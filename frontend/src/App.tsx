import { useState, useEffect } from "react";
import { ClerkProvider, SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import {
  Routes,
  Route,
  useParams,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";

import { SignInForm } from "./components/SignInForm";
import { Toaster } from "sonner";
import BookLibrary from "./components/BookLibrary";
import { BookReader } from "./components/BookReader";
import { SettingsProvider } from "./contexts/SettingsContext";
import { TopActions } from "./components/TopActions";
import { HeroBanner } from "./components/HeroBanner";
import { DangerZone } from "./components/DangerZone";
import { Footer } from "./components/Footer";
import { VocabularyPage } from "./components/VocabularyPage";
import { LoginModal } from "./components/LoginModal";
import { AppDataProvider, useAppData } from "./contexts/AppDataContext";
import { gDriveService } from "./services/gdriveService";

// Get Clerk publishable key from environment variable
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function App() {
  if (!clerkPubKey) {
    throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment variables");
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <AppDataProvider>
        <AppContent />
      </AppDataProvider>
    </ClerkProvider>
  );
}

function AppContent() {
  const [showLogin, setShowLogin] = useState(false);

  // Clerk hooks
  const { user: clerkUser, isSignedIn: isClerkSignedIn, isLoaded: isClerkLoaded } = useUser();
  const { isDriveConnected, isDriveLoading } = useAppData();

  // Check for corrupted Google Drive tokens on app startup
  useEffect(() => {
    if (isClerkLoaded) {
      // Check for corrupted tokens after Clerk loads
      gDriveService.checkAndClearCorruptedTokens();
    }
  }, [isClerkLoaded]);

  // Disable automatic Google Drive connection from AppContent
  // Let useStorageService handle authentication to avoid competing flows
  // useEffect(() => {
  //   // Only proceed if Clerk sign-in is complete, user data is available, and Drive is not already loading.
  //   if (isClerkLoaded && isClerkSignedIn && clerkUser && !isDriveLoading) {
  //     // Check if one of the Clerk external accounts is Google
  //     // The exact provider string ('google', 'google_oauth2', etc.) might depend on your Clerk instance config.
  //     // Inspect clerkUser.externalAccounts[0].provider to be sure.
  //     const wasGoogleClerkLogin = clerkUser.externalAccounts?.some(
  //       (acc) => acc.provider.startsWith("google") // Using startsWith for more flexibility
  //     );

  //     if (wasGoogleClerkLogin && !isDriveConnected) {
  //       console.log(
  //         "[AppContent] Clerk Google sign-in detected. Google Drive not yet connected. Waiting for automatic connection..."
  //       );
  //       // Try silent sign-in first, only prompt if that fails
  //       gDriveService.signIn('');
  //     }
  //   }
  // }, [
  //   isClerkLoaded,
  //   isClerkSignedIn,
  //   clerkUser,
  //   isDriveConnected,
  //   isDriveLoading,
  // ]);

  // Prefetch JPDB due cards only after user is signed in if enabled
  useEffect(() => {
    if (
      isClerkLoaded &&
      isClerkSignedIn &&
      localStorage.getItem('preferDueCards') === 'true'
    ) {
      // Removed automatic prefetching - due cards are now fetched manually only
    // prefetchDueCards();
    }
  }, [isClerkLoaded, isClerkSignedIn]);

  return (
    <SettingsProvider>
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
        <SignedIn>
          <Routes>
            <Route path="/" element={<MainLayout setShowLogin={setShowLogin} />}> 
              <Route index element={<BookLibrary />} />
              <Route path="vocabulary" element={<VocabularyPage />} />
              <Route path="stats" element={<StatsPlaceholder />} />
            </Route>
            <Route path="book/:bookId" element={<BookReaderRoute />} />
          </Routes>
        </SignedIn>
        <SignedOut>
          <SignedOutLayout setShowLogin={setShowLogin} />
        </SignedOut>
        <Footer />
        <DangerZone />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
        <Toaster />
      </div>
    </SettingsProvider>
  );
}

function MainLayout({ setShowLogin }: { setShowLogin: (v: boolean) => void }) {
  const location = useLocation();
  const currentPage = location.pathname.startsWith('/vocabulary')
    ? 'vocabulary'
    : location.pathname.startsWith('/stats')
    ? 'stats'
    : 'library';

  return (
    <div className="flex flex-col flex-1">
      <TopActions currentPage={currentPage} onShowLogin={() => setShowLogin(true)} />
      <HeroBanner />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

function SignedOutLayout({ setShowLogin }: { setShowLogin: (v: boolean) => void }) {
  return (
    <div className="flex flex-col flex-1">
      <TopActions currentPage="library" onShowLogin={() => setShowLogin(true)} />
      <HeroBanner />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md mx-auto">
          <SignInForm />
        </div>
      </div>
    </div>
  );
}

function BookReaderRoute() {
  const { bookId } = useParams<{ bookId: string }>();
  if (!bookId) return null;
  return <BookReader bookId={bookId} />;
}

function StatsPlaceholder() {
  return (
    <div className="p-8 text-center">
      <h2 className="text-2xl font-bold mb-4">Reading Statistics</h2>
      <p className="text-gray-600">Stats page coming soon...</p>
    </div>
  );
}

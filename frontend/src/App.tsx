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
import { JpdbPopupController } from "./components/JpdbPopup";
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
import { AdminPage } from "./components/AdminPage";


// Get Clerk publishable key from environment variable
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

console.log('🔐 [APP CLERK DEBUG] App component Clerk key check:', clerkPubKey ? `${clerkPubKey.substring(0, 10)}...${clerkPubKey.substring(clerkPubKey.length - 5)}` : 'UNDEFINED')
console.log('🔐 [APP CLERK DEBUG] Environment mode:', import.meta.env.MODE)
console.log('🔐 [APP CLERK DEBUG] Available VITE_ vars:', Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')))

export default function App() {
  if (!clerkPubKey) {
    console.error('❌ [APP CLERK DEBUG] Missing VITE_CLERK_PUBLISHABLE_KEY in App component!')
    console.error('❌ [APP CLERK DEBUG] Available env vars:', import.meta.env)
    throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment variables");
  }
  
  console.log('✅ [APP CLERK DEBUG] Clerk key available for ClerkProvider')

  return (
    <ClerkProvider 
      publishableKey={clerkPubKey}
      appearance={{
        variables: {
          colorPrimary: "#3b82f6",
          colorDanger: "#ef4444",
          colorSuccess: "#10b981",
          colorWarning: "#f59e0b",
          colorNeutral: "#6b7280",
          colorText: "#1f2937",
          colorTextSecondary: "#6b7280",
          colorTextOnPrimaryBackground: "#ffffff",
          colorBackground: "#ffffff",
          colorInputBackground: "#ffffff",
          colorInputText: "#1f2937",
          borderRadius: "0.5rem",
          fontFamily: "system-ui, -apple-system, sans-serif"
        },
        elements: {
          card: "shadow-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg",
          headerTitle: "text-gray-900 dark:text-white text-xl font-semibold",
          headerSubtitle: "text-gray-600 dark:text-gray-300 text-sm",
          formFieldLabel: "text-gray-700 dark:text-gray-300 text-sm font-medium",
          formFieldInput: "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400",
          formButtonPrimary: "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium transition-colors",
          socialButtonsIconButton: "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 transition-colors",
          dividerLine: "bg-gray-200 dark:bg-gray-600",
          dividerText: "text-gray-500 dark:text-gray-400 text-sm",
          footerActionText: "text-gray-600 dark:text-gray-400 text-sm",
          footerActionLink: "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium",
          main: "space-y-4",
          formFieldRow: "space-y-1"
        }
      }}
      // Enable session token persistence across page refreshes
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/"
      afterSignUpUrl="/"
    >
      <AppDataProvider>
        <AppContent />
      </AppDataProvider>
    </ClerkProvider>
  );
}

function AppContent() {
  // Clerk hooks
  const { user: clerkUser, isSignedIn: isClerkSignedIn, isLoaded: isClerkLoaded } = useUser();
  const { isDriveConnected, isDriveLoading } = useAppData();

  // Don't check for corrupted tokens here - let the auth flow handle it
  // The race condition with Clerk loading was causing valid tokens to be cleared

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
            <Route path="/" element={<MainLayout />}>
              <Route index element={<BookLibrary />} />
              <Route path="vocabulary" element={<VocabularyPage />} />
              <Route path="stats" element={<StatsPlaceholder />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="book/:bookId" element={<BookReaderRoute />} />
          </Routes>
        </SignedIn>
        <SignedOut>
          <SignedOutLayout />
        </SignedOut>
        <Footer />
        <DangerZone />
        <Toaster />
        <JpdbPopupController />
      </div>
    </SettingsProvider>
  );
}

function MainLayout() {
  const location = useLocation();
  const currentPage = location.pathname.startsWith('/vocabulary')
    ? 'vocabulary'
    : location.pathname.startsWith('/stats')
    ? 'stats'
    : location.pathname.startsWith('/admin')
    ? 'admin'
    : 'library';

  return (
    <div className="flex flex-col flex-1">
      <TopActions currentPage={currentPage} />
      <HeroBanner />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

function SignedOutLayout() {
  const scrollToSignIn = () => {
    const signInSection = document.getElementById('sign-in-section');
    if (signInSection) {
      signInSection.scrollIntoView({ 
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <TopActions currentPage="library" onShowLogin={scrollToSignIn} />
      <HeroBanner />
      <div id="sign-in-section" className="flex-1 flex items-center justify-center p-4 sm:p-8">
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

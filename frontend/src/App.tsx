import { useState, useEffect } from "react";
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn, useUser } from "@clerk/clerk-react";
import {
  Routes,
  Route,
  useParams,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useTranslation } from "react-i18next";

import { SignInForm } from "@shared/components/SignInForm";
import { Toaster } from "sonner";
import { JpdbPopupController } from "./features/reader/components/JpdbPopup";
import BookLibrary from "./features/books/components/BookLibrary";
import { BookReader } from "./features/reader/components/BookReader";
import { SettingsProvider } from "@shared/contexts/SettingsContext";
import { TopActions } from "@shared/components/TopActions";
import { HeroBanner } from "@shared/components/HeroBanner";
import { DangerZone } from "@shared/components/DangerZone";
import { Footer } from "@shared/components/Footer";
import { VocabularyPage } from "./features/vocabulary/components/VocabularyPage";
import { LoginModal } from "@shared/components/LoginModal";
import { AppDataProvider, useAppData } from "@shared/contexts/AppDataContext";
import { gDriveService } from "@integrations/googleDrive/gdriveService";
import { AdminPage } from "./features/admin/components/AdminPage";
import ClipboardReader from "./features/clipboard/components/ClipboardReader";
import { JLPTTestPage } from "./features/jlpt/components/JLPTTestPage";

// Helper component to allow access if signed in OR has offline books
function AuthOrOfflineGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useUser();
  const { books } = useAppData();

  // Allow if signed in, OR if we have offline books (offline mode)
  if (isSignedIn || books.length > 0) {
    return <>{children}</>;
  }

  return <RedirectToSignIn />;
}


// Get Clerk publishable key from environment variable
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

console.log('🔐 [APP CLERK DEBUG] App component Clerk key check:', clerkPubKey ? `${clerkPubKey.substring(0, 10)}...${clerkPubKey.substring(clerkPubKey.length - 5)}` : 'UNDEFINED')
console.log('🔐 [APP CLERK DEBUG] Environment mode:', import.meta.env.MODE)


export default function App() {
  if (!clerkPubKey) {
    console.error('Missing Clerk publishable key')
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h1>Configuration Error</h1>
        <p>Missing Clerk publishable key. Please check your .env file.</p>
      </div>
    )
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={{
        layout: {
          // tidy up defaults
        },
        variables: {
          colorPrimary: "#2563eb",
          colorBackground: "#ffffff",
          colorText: "#111827",
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
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<BookLibrary />} />
            <Route path="vocabulary" element={
              <AuthOrOfflineGuard>
                <VocabularyPage />
              </AuthOrOfflineGuard>
            } />
            <Route path="clipboard" element={
              <AuthOrOfflineGuard>
                <ClipboardReader />
              </AuthOrOfflineGuard>
            } />
            <Route path="admin" element={
              <SignedIn><AdminPage /></SignedIn>
            } />
            <Route path="jlpt-tests" element={<JLPTTestPage />} />
          </Route>

          <Route path="sign-in/*" element={<SignedOutLayout />} />
          <Route path="sign-up/*" element={<SignedOutLayout />} />

          <Route path="book/:bookId" element={<BookReaderRoute />} />
        </Routes>
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
  const navigate = useNavigate();
  const isJLPTTestPage = location.pathname.startsWith('/jlpt-tests');

  const handleShowLogin = () => {
    // Navigate to home if not already there since the login form is on home
    if (location.pathname !== '/') {
      navigate('/');
      // Wait for navigation and render
      setTimeout(() => {
        const el = document.getElementById('sign-in-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      // Already on home, just scroll
      const el = document.getElementById('sign-in-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <div>
      <TopActions
        currentPage={
          location.pathname.startsWith('/vocabulary') ? 'vocabulary' :
            location.pathname.startsWith('/clipboard') ? 'stats' :
              location.pathname.startsWith('/admin') ? 'admin' :
                location.pathname.startsWith('/jlpt-tests') ? 'jlpt' : 'library'
        }
        onShowLogin={handleShowLogin}
      />
      {!isJLPTTestPage && <HeroBanner />}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function SignedOutLayout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          {t("app.signedOut.title")}
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">{t("app.signedOut.description")}</p>
        <SignInForm />
      </div>
    </div>
  );
}

function BookReaderRoute() {
  const { bookId } = useParams<{ bookId: string }>();
  if (!bookId) return null;
  return <BookReader bookId={bookId} />;
}

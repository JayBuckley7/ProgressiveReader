import { ClerkProvider, SignedIn, RedirectToSignIn, useUser } from "@clerk/clerk-react";
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
import { DangerZone } from "@shared/components/DangerZone";
import { Footer } from "@shared/components/Footer";
import { VocabularyPage } from "./features/vocabulary/components/VocabularyPage";
import { AppDataProvider, useAppData } from "@shared/contexts/AppDataContext";
import { AdminPage } from "./features/admin/components/AdminPage";
import ClipboardReader from "./features/clipboard/components/ClipboardReader";
import { JLPTTestPage } from "./features/jlpt/components/JLPTTestPage";
import GrammarPage from "./features/grammar/components/GrammarPage";
import { GrammarProvider } from "@features/grammar/contexts/GrammarContext";
import { AppDepsProvider } from "@app/deps/AppDepsProvider";

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

export default function App({ clerkPubKey }: { clerkPubKey: string }) {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={{
        variables: {
          colorPrimary: "var(--ui-accent)",
          colorBackground: "var(--ui-surface)",
          colorText: "var(--ui-text)",
          colorTextSecondary: "var(--ui-muted)",
          fontFamily:
            '"Inter Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
          borderRadius: "10px"
        },
        elements: {
          card: "app-card shadow-none",
          headerTitle: "text-lg font-semibold",
          headerSubtitle: "text-sm app-muted",
          formFieldLabel: "text-sm font-medium",
          formFieldInput: "app-input text-sm",
          formButtonPrimary: "app-button-primary rounded-md text-sm font-medium transition-colors",
          socialButtonsIconButton: "app-button-muted rounded-md transition-colors",
          dividerLine: "bg-[var(--ui-border)]",
          dividerText: "text-xs app-muted",
          footerActionText: "text-sm app-muted",
          footerActionLink: "text-sm font-medium underline underline-offset-4 hover:opacity-80",
          main: "space-y-4",
          formFieldRow: "space-y-1"
        }
      }}
      // Enable session token persistence across page refreshes
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      <AppDepsProvider>
        <AppDataProvider>
          <AppContent />
        </AppDataProvider>
      </AppDepsProvider>
    </ClerkProvider>
  );
}


function AppContent() {
  return (
    <SettingsProvider>
      <GrammarProvider>
        <div className="flex flex-col min-h-screen app-shell">
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
              <Route path="grammar" element={
                <AuthOrOfflineGuard>
                  <GrammarPage />
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
      </GrammarProvider>
    </SettingsProvider>
  );
}

function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();

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
            location.pathname.startsWith('/grammar') ? 'grammar' :
            location.pathname.startsWith('/clipboard') ? 'stats' :
              location.pathname.startsWith('/admin') ? 'admin' :
                location.pathname.startsWith('/jlpt-tests') ? 'jlpt' : 'library'
        }
        onShowLogin={handleShowLogin}
      />
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
      <div className="app-card p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-2">
          {t("app.signedOut.title")}
        </h2>
        <p className="text-sm app-muted mb-4">{t("app.signedOut.description")}</p>
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

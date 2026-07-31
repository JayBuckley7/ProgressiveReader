import { ClerkProvider, SignedIn, RedirectToSignIn, useUser } from "@clerk/clerk-react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Routes,
  Route,
  useParams,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { SignInForm } from "@shared/components/SignInForm";
import { Toaster } from "sonner";
import { SettingsProvider } from "@shared/contexts/SettingsContext";
import { TopActions } from "@shared/components/TopActions";
import { DangerZone } from "@shared/components/DangerZone";
import { Footer } from "@shared/components/Footer";
import { AppDataProvider, useAppData } from "@shared/contexts/AppDataContext";
import { AppDepsProvider } from "@app/deps/AppDepsProvider";
import { JPDB_POPUP_NEEDED_EVENT } from "@features/reader/components/JpdbPopupBridge";

const BookLibrary = lazy(() => import("./features/books/components/BookLibrary"));
const BookReader = lazy(() =>
  import("./features/reader/components/BookReader").then((module) => ({ default: module.BookReader }))
);
const TestReaderRoute = lazy(() =>
  import("@features/reader/testing/TestReaderRoute").then((module) => ({ default: module.TestReaderRoute }))
);
const VocabularyPage = lazy(() =>
  import("./features/vocabulary/components/VocabularyPage").then((module) => ({ default: module.VocabularyPage }))
);
const AdminPage = lazy(() =>
  import("./features/admin/components/AdminPage").then((module) => ({ default: module.AdminPage }))
);
const ClipboardReader = lazy(() => import("./features/clipboard/components/ClipboardReader"));
const JLPTTestPage = lazy(() =>
  import("./features/jlpt/components/JLPTTestPage").then((module) => ({ default: module.JLPTTestPage }))
);
const GrammarPage = lazy(() => import("./features/grammar/components/GrammarPage"));
const JpdbPopupController = lazy(() =>
  import("./features/reader/components/JpdbPopup").then((module) => ({ default: module.JpdbPopupController }))
);
const LazyGrammarProvider = lazy(() =>
  import("@features/grammar/contexts/GrammarContext").then((module) => ({ default: module.GrammarProvider }))
);

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
  const location = useLocation();
  const isReaderRoute = /^\/(?:book\/[^/]+|pdfs?|epub)\/?$/.test(location.pathname);

  return (
    <SettingsProvider>
      <div
        className={`flex flex-col app-shell ${
          isReaderRoute ? "h-[100dvh] overflow-hidden" : "min-h-screen"
        }`}
      >
        <Suspense fallback={<RouteFallback />}>
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
              <Route element={<GrammarRouteShell />}>
                <Route path="grammar" element={
                  <AuthOrOfflineGuard>
                    <GrammarPage />
                  </AuthOrOfflineGuard>
                } />
                <Route path="jlpt-tests" element={<JLPTTestPage />} />
              </Route>
            </Route>

            <Route path="sign-in/*" element={<SignedOutLayout />} />
            <Route path="sign-up/*" element={<SignedOutLayout />} />

            <Route element={<ReaderRouteShell />}>
              <Route path="pdf" element={<TestReaderRoute kind="pdf" />} />
              <Route path="pdfs" element={<TestReaderRoute kind="pdfs" />} />
              <Route path="epub" element={<TestReaderRoute kind="epub" />} />
              <Route path="book/:bookId" element={<BookReaderRoute />} />
            </Route>
          </Routes>
        </Suspense>
        {!isReaderRoute && <Footer />}
        <DangerZone />
        <Toaster />
      </div>
    </SettingsProvider>
  );
}

function GrammarRouteShell() {
  return (
    <LazyGrammarProvider>
      <Outlet />
    </LazyGrammarProvider>
  );
}

function ReaderRouteShell() {
  return (
    <LazyGrammarProvider>
      <Outlet />
      <DeferredJpdbPopupController />
    </LazyGrammarProvider>
  );
}

function DeferredJpdbPopupController() {
  const [isNeeded, setIsNeeded] = useState(false);

  useEffect(() => {
    const handlePopupNeeded = () => setIsNeeded(true);
    window.addEventListener(JPDB_POPUP_NEEDED_EVENT, handlePopupNeeded);
    return () => window.removeEventListener(JPDB_POPUP_NEEDED_EVENT, handlePopupNeeded);
  }, []);

  if (!isNeeded) return null;
  return (
    <Suspense fallback={null}>
      <JpdbPopupController />
    </Suspense>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center" role="status" aria-label="Loading page">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-[color:var(--ui-border)] border-t-[color:var(--ui-text)]" />
    </div>
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
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
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

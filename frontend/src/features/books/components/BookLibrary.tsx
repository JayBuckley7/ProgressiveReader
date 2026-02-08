import { useState, useEffect } from "react";
import { SettingsModal } from "@shared/components/SettingsModal";
import { FolderManager } from "./FolderManager";
import { FolderView } from "./FolderView";
import { TokenStatusWarning } from "@shared/components/TokenStatusWarning";
import { MassUploadModal } from "./MassUploadModal";
import { useAppData } from "@shared/contexts/AppDataContext";
import { useUser } from "@clerk/clerk-react";
import { useSettings } from "@shared/contexts/SettingsContext";
import { vocabBank } from "@features/vocabulary/services/vocabBank";
import { useAppDeps } from "@app/deps/AppDepsProvider";

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SignInForm } from "@shared/components/SignInForm";
import { appLog } from '@shared/appLog'

interface BookLibraryProps {
  onSelectBook?: (bookId: string) => void;
}

function BookLibrary({ onSelectBook }: BookLibraryProps = {}) {
  const deps = useAppDeps();
  const navigate = useNavigate();
  const { user: clerkUser, isSignedIn, isLoaded } = useUser();
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const [vocabStats, setVocabStats] = useState({ saved: 0, mastered: 0 });
  const density = settings?.libraryDensity ?? "comfortable";

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let hasLoaded = false;
    const unsubscribe = deps.driveAuth.onAuthStateChange((authed) => {
      if (authed && !hasLoaded) {
        hasLoaded = true;
        vocabBank.load(deps.drive).then(() => setVocabStats(vocabBank.getStats()));
      }
    });
    return unsubscribe;
  }, [deps.driveAuth, isLoaded, isSignedIn]);

  const handleSelectBook = (id: string) => {
    if (onSelectBook) {
      onSelectBook(id);
    } else {
      navigate(`/book/${id}`);
    }
  };

  // Helper function to render the appropriate state when not connected to Drive
  const renderNotConnectedState = () => {
    // Check if user signed in with Google
    const wasGoogleClerkLogin = clerkUser?.externalAccounts?.some(
      (acc) => acc.provider.startsWith("google")
    );

    if (wasGoogleClerkLogin) {
      // User signed in with Google - show auto-connecting message with manual option
      return (
        <div className="flex justify-center py-12">
          <div className="w-full max-w-lg app-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg book-cover-placeholder">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 014-4h1a5 5 0 019.9 1H19a4 4 0 010 8H7a4 4 0 01-4-4z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2">
              {t("bookLibrary.googleConnecting.title")}
            </h2>
            <p className="text-sm app-muted mb-6">
              {t("bookLibrary.googleConnecting.description")}
            </p>
            <div className="flex justify-center mb-4">
              <div className="app-muted animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
            </div>
            <p className="text-sm app-muted mb-4">
              {t("bookLibrary.googleConnecting.takingTooLong")}
            </p>
            <button
              onClick={async () => {
                appLog.debug("Manual Google Drive connection requested");
                await connectToGoogleDriveAndLoad();
              }}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors app-button-primary"
            >
              {t("bookLibrary.googleConnecting.manualButton")}
            </button>
          </div>
        </div>
      );
    } else {
      // User didn't sign in with Google - show explanation
      return (
        <div className="flex justify-center py-12">
          <div className="w-full max-w-lg app-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg book-cover-placeholder">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 20h8" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2">
              {t("bookLibrary.localMode.title")}
            </h2>
            <p className="text-sm app-muted mb-4">
              {t("bookLibrary.localMode.description")}
            </p>
            <p className="text-sm app-muted">
              {t("bookLibrary.localMode.info")}
            </p>
          </div>
        </div>
      );
    }
  };

	  const {
	    books,
	    folders,
	    isAuthenticated,
	    deleteBook,
	    updateBookCover,
	    openCloudFolder,
	    syncBooks,

    createFolder,
    updateFolder,
    deleteFolder,
    moveBookToFolder,
    isDriveConnected,
    isLoading,
    isDriveBookLoading,
    connectToGoogleDriveAndLoad
  } = useAppData();

  // All book handling is delegated to the storage service.

  const [showSettings, setShowSettings] = useState(false);
  const [showFolderManager, setShowFolderManager] = useState(false);
  const [showMassUpload, setShowMassUpload] = useState(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-7">
      {(isAuthenticated || books.length > 0) && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">{t("bookLibrary.title")}</h1>
              {isSignedIn && (
                <div className="hidden sm:flex flex-wrap items-center gap-x-2 gap-y-1 text-xs app-muted">
                  <span className="whitespace-nowrap">
                    {t("hero.signedIn.stats.books")}:{" "}
                    <strong className="text-[color:var(--ui-text)]">{books.length}</strong>
                  </span>
                  <span aria-hidden="true" className="opacity-60">•</span>
                  <span className="whitespace-nowrap">
                    {t("hero.signedIn.stats.wordsSaved")}:{" "}
                    <strong className="text-[color:var(--ui-text)]">{vocabStats.saved}</strong>
                  </span>
                  <span aria-hidden="true" className="opacity-60">•</span>
                  <span className="whitespace-nowrap">
                    {t("hero.signedIn.stats.wordsMastered")}:{" "}
                    <strong className="text-[color:var(--ui-text)]">{vocabStats.mastered}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="inline-flex items-center rounded-md border app-border bg-[var(--ui-surface-alt)] p-0.5">
              <button
                type="button"
                aria-pressed={density === "comfortable"}
                onClick={() => updateSettings({ libraryDensity: "comfortable" })}
                className={`px-3 py-1.5 rounded-[6px] text-[11px] font-medium transition-colors ${
                  density === "comfortable"
                    ? "bg-[var(--ui-surface)] text-[color:var(--ui-text)] shadow-sm"
                    : "text-[color:var(--ui-muted)] hover:text-[color:var(--ui-text)]"
                }`}
              >
                {t("bookLibrary.density.comfortable")}
              </button>
              <button
                type="button"
                aria-pressed={density === "compact"}
                onClick={() => updateSettings({ libraryDensity: "compact" })}
                className={`px-3 py-1.5 rounded-[6px] text-[11px] font-medium transition-colors ${
                  density === "compact"
                    ? "bg-[var(--ui-surface)] text-[color:var(--ui-text)] shadow-sm"
                    : "text-[color:var(--ui-muted)] hover:text-[color:var(--ui-text)]"
                }`}
              >
                {t("bookLibrary.density.compact")}
              </button>
            </div>

            {isAuthenticated && (
              <div className="flex items-center gap-1">
                <button
                  onClick={openCloudFolder}
                  className="h-9 w-9 flex items-center justify-center app-icon-button transition-colors"
                  title={t("bookLibrary.buttons.openCloud")}
                  aria-label={t("bookLibrary.buttons.openCloud")}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18l1 6H2l1-6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12h20M2 16h20" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12v4M18 12v4" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    appLog.debug("sync library button clicked");
                    syncBooks();
                  }}
                  className="h-9 w-9 flex items-center justify-center app-icon-button transition-colors"
                  title={t("bookLibrary.buttons.sync")}
                  aria-label={t("bookLibrary.buttons.sync")}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 15a9 9 0 0014-3m0-4a9 9 0 00-14-3" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowFolderManager(true)}
                  className="h-9 w-9 flex items-center justify-center app-icon-button transition-colors"
                  title={t("bookLibrary.buttons.manageFolders")}
                  aria-label={t("bookLibrary.buttons.manageFolders")}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
              </div>
            )}

            <button
              onClick={() => setShowMassUpload(true)}
              className="h-9 px-4 rounded-md text-sm font-medium flex items-center gap-2 app-button-primary"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t("bookLibrary.buttons.addBooks")}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="h-9 w-9 flex items-center justify-center app-icon-button transition-colors"
              title={t("settings.title", "Settings")}
              aria-label={t("settings.title", "Settings")}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Token Status Warning */}
      <TokenStatusWarning />

      {/* Main content rendering logic */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-full max-w-md app-card p-6 text-center">
            <div className="flex justify-center">
              <div className="app-muted animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
            </div>
            <p className="mt-4 text-sm app-muted">{t("bookLibrary.loading.description")}</p>
          </div>
        </div>
      ) : !isAuthenticated && books.length === 0 ? (
        !isOnline && books.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="w-full max-w-lg app-card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg book-cover-placeholder">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-2">
                {t("bookLibrary.offline.title", "No Offline Books Found")}
              </h2>
              <p className="text-sm app-muted max-w-md mx-auto">
                {t("bookLibrary.offline.description", "You are offline and have no saved books. Please connect to the internet and sign in to access your library.")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-12" id="sign-in-section">
            <div className="w-full max-w-md app-card p-6">
              <h2 className="text-lg font-semibold mb-2 text-center">
                {t("bookLibrary.signInPrompt.title") || "Sign in to your library"}
              </h2>
              <p className="text-sm app-muted mb-6 text-center">
                {t("bookLibrary.signInPrompt.description") || "Sign in to view and manage your books"}
              </p>
              <SignInForm />
            </div>
          </div>
        )
      ) : books.length > 0 ? (
        /* OFFLINE-FIRST: Always show books if we have them, regardless of connection state */
        <FolderView
          books={books}
          folders={folders}
          onSelectBook={handleSelectBook}
          onDeleteBook={deleteBook}
          onUpdateCover={updateBookCover}
          onMoveBookToFolder={moveBookToFolder}
          density={density}
        />
      ) : !isDriveConnected ? (
        renderNotConnectedState()
      ) : (isDriveBookLoading) && isDriveConnected ? (
        <div className="flex justify-center py-12">
          <div className="w-full max-w-md app-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg book-cover-placeholder">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3v5h5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2">
            {t("bookLibrary.loading.title")}
          </h2>
            <p className="text-sm app-muted mb-6">
            {t("bookLibrary.loading.description")}
          </p>
            <div className="flex justify-center">
              <div className="app-muted animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-center py-12">
          <div className="w-full max-w-lg app-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg book-cover-placeholder">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3v5h5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2">
            {t("bookLibrary.empty.title")}
          </h2>
            <p className="text-sm app-muted mb-4">
            {t("bookLibrary.empty.description")}
          </p>
            <p className="text-sm app-muted mb-6">
            {t("bookLibrary.empty.supportedFormats")}
          </p>
            <button
            onClick={() => setShowMassUpload(true)}
              className="px-6 py-3 rounded-md text-sm font-medium flex items-center gap-2 app-button-primary"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("bookLibrary.buttons.uploadFirst")}
          </button>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onTranslate={() => { }}
          translating={false}
        />
      )}

      {showFolderManager && (
        <FolderManager
          folders={folders}
          onCreateFolder={createFolder}
          onUpdateFolder={updateFolder}
          onDeleteFolder={deleteFolder}
          onClose={() => setShowFolderManager(false)}
        />
      )}

      {showMassUpload && (
        <MassUploadModal
          onClose={() => setShowMassUpload(false)}
          onUploadComplete={() => {
            // Refresh the library after successful uploads
            syncBooks();
          }}
        />
      )}
    </div>
  );
}

export default BookLibrary;

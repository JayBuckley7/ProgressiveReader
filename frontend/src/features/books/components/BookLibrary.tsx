import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { FolderView } from "./FolderView";
import { ContinueReading } from "./ContinueReading";
import { TokenStatusWarning } from "@shared/components/TokenStatusWarning";
import { useAppData } from "@shared/contexts/AppDataContext";
import { useUser } from "@clerk/clerk-react";
import { useSettings } from "@shared/contexts/SettingsContext";
import { useAppDeps } from "@app/deps/AppDepsProvider";
import { isGoogleLinkedClerkUser } from "@features/books/services/bookLibrary/provider";

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SignInForm } from "@shared/components/SignInForm";
import { appLog } from '@shared/appLog'
import type { BookMetadata, ReadingProgress } from "~/types";
import {
  continueReadingBooks,
  filterAndSortBooks,
  type LibrarySort,
  type ReadingProgressByBookId,
} from "../utils/libraryView";
import {
  dismissContinueReadingProgress,
  isContinueReadingProgressDismissed,
  readContinueReadingPreferences,
  writeContinueReadingPreferences,
} from "../utils/continueReadingPreferences";

const SettingsModal = lazy(() =>
  import("@shared/components/SettingsModal").then((module) => ({ default: module.SettingsModal }))
);
const LazyGrammarProvider = lazy(() =>
  import("@features/grammar/contexts/GrammarContext").then((module) => ({ default: module.GrammarProvider }))
);
const FolderManager = lazy(() =>
  import("./FolderManager").then((module) => ({ default: module.FolderManager }))
);
const MassUploadModal = lazy(() =>
  import("./MassUploadModal").then((module) => ({ default: module.MassUploadModal }))
);

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
  const [progressByBookId, setProgressByBookId] = useState<ReadingProgressByBookId>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("recentlyAdded");
  const continueReadingUserId = clerkUser?.id ?? "offline";
  const [continueReadingPreferences, setContinueReadingPreferences] = useState(() =>
    readContinueReadingPreferences(continueReadingUserId)
  );
  const [continueReadingPreferencesUserId, setContinueReadingPreferencesUserId] =
    useState(continueReadingUserId);
  const density = settings?.libraryDensity ?? "comfortable";

  useEffect(() => {
    if (continueReadingPreferencesUserId === continueReadingUserId) return;
    setContinueReadingPreferences(readContinueReadingPreferences(continueReadingUserId));
    setContinueReadingPreferencesUserId(continueReadingUserId);
  }, [continueReadingPreferencesUserId, continueReadingUserId]);

  useEffect(() => {
    if (continueReadingPreferencesUserId !== continueReadingUserId) return;
    writeContinueReadingPreferences(continueReadingUserId, continueReadingPreferences);
  }, [continueReadingPreferences, continueReadingPreferencesUserId, continueReadingUserId]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let hasScheduled = false;
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const loadStats = async () => {
      try {
        const { vocabBank } = await import("@features/vocabulary/services/vocabBank");
        await vocabBank.load(deps.drive);
        if (!cancelled) setVocabStats(vocabBank.getStats());
      } catch (error) {
        appLog.warn("[BookLibrary] Failed to load vocabulary stats", error);
      }
    };

    const scheduleStats = () => {
      if (hasScheduled) return;
      hasScheduled = true;

      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(() => void loadStats(), { timeout: 4000 });
      } else {
        timeoutHandle = window.setTimeout(() => void loadStats(), 1200);
      }
    };

    const unsubscribe = deps.driveAuth.onAuthStateChange((authed) => {
      if (authed) scheduleStats();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, [deps.drive, deps.driveAuth, isLoaded, isSignedIn]);

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
    const wasGoogleClerkLogin = isGoogleLinkedClerkUser(clerkUser);

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
    lastLibrarySyncAt,
    getReadingProgresses,
    connectToGoogleDriveAndLoad
  } = useAppData();

  // All book handling is delegated to the storage service.

  const bookIdSignature = useMemo(
    () => books.map((book) => book.id).sort().join("|"),
    [books]
  );

  useEffect(() => {
    let cancelled = false;
    const bookIds = bookIdSignature ? bookIdSignature.split("|") : [];

    if (bookIds.length === 0) {
      setProgressByBookId({});
      return;
    }

    void getReadingProgresses(bookIds).then((progresses) => {
      if (!cancelled) setProgressByBookId(progresses);
    });

    return () => {
      cancelled = true;
    };
  }, [bookIdSignature, getReadingProgresses, isDriveConnected, lastLibrarySyncAt]);

  const visibleBooks = useMemo(
    () => filterAndSortBooks({ books, folders, progressByBookId, query, sort }),
    [books, folders, progressByBookId, query, sort]
  );

  const continueItems = useMemo(
    () =>
      continueReadingBooks(books, progressByBookId, books.length)
        .filter(
          ({ progress }) => !isContinueReadingProgressDismissed(continueReadingPreferences, progress)
        )
        .slice(0, 4),
    [books, continueReadingPreferences, progressByBookId]
  );

  const handleResumeBook = (book: BookMetadata, progress: ReadingProgress) => {
    const baseUrl = `/book/${book.id}`;
    if (progress.fileType?.toLowerCase() === "pdf" && progress.currentPage) {
      navigate(`${baseUrl}?page=${progress.currentPage}`);
      return;
    }
    navigate(`${baseUrl}?ch=${Math.max(progress.currentChapter, 0)}`);
  };

  const lastSyncLabel = useMemo(() => {
    if (!lastLibrarySyncAt) return null;
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(lastLibrarySyncAt));
  }, [lastLibrarySyncAt]);

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
            <div className="mt-1 flex items-center gap-2 text-xs app-muted" role="status" aria-live="polite">
              {isDriveBookLoading ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--ui-accent)]" />
                  <span>{t("bookLibrary.status.syncing")}</span>
                </>
              ) : lastSyncLabel ? (
                <span>{t("bookLibrary.status.lastSynced", { time: lastSyncLabel })}</span>
              ) : null}
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
      {books.length > 0 ? (
        <>
          <ContinueReading
            items={continueItems}
            onResume={handleResumeBook}
            collapsed={continueReadingPreferences.collapsed}
            onCollapsedChange={(collapsed) =>
              setContinueReadingPreferences((current) => ({ ...current, collapsed }))
            }
            onDismiss={(progress) =>
              setContinueReadingPreferences((current) =>
                dismissContinueReadingProgress(current, progress)
              )
            }
          />

          <div className="mb-5 flex flex-col gap-3 border-y app-border py-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 app-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("bookLibrary.search.placeholder")}
                aria-label={t("bookLibrary.search.label")}
                className="h-10 w-full rounded-md border app-border bg-[var(--ui-surface)] pl-9 pr-9 text-sm outline-none transition-colors focus:border-[color:var(--ui-accent)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md app-muted hover:bg-[var(--ui-surface-alt)]"
                  aria-label={t("bookLibrary.search.clear")}
                >
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="library-sort" className="whitespace-nowrap text-xs app-muted">
                {t("bookLibrary.sort.label")}
              </label>
              <select
                id="library-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as LibrarySort)}
                className="h-10 rounded-md border app-border bg-[var(--ui-surface)] px-3 text-sm outline-none focus:border-[color:var(--ui-accent)]"
              >
                <option value="recentlyAdded">{t("bookLibrary.sort.recentlyAdded")}</option>
                <option value="recentlyRead">{t("bookLibrary.sort.recentlyRead")}</option>
                <option value="title">{t("bookLibrary.sort.title")}</option>
              </select>
            </div>
          </div>

          {visibleBooks.length > 0 ? (
            <FolderView
              books={visibleBooks}
              folders={folders}
              onSelectBook={handleSelectBook}
              onDeleteBook={deleteBook}
              onUpdateCover={updateBookCover}
              onMoveBookToFolder={moveBookToFolder}
              density={density}
              hideEmptySections={query.trim().length > 0}
            />
          ) : (
            <div className="py-14 text-center">
              <h2 className="text-base font-semibold">{t("bookLibrary.search.noResultsTitle")}</h2>
              <p className="mt-1 text-sm app-muted">{t("bookLibrary.search.noResultsDescription")}</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 h-9 rounded-md px-4 text-sm font-medium app-button-muted"
              >
                {t("bookLibrary.search.clear")}
              </button>
            </div>
          )}
        </>
      ) : isLoading ? (
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
          <div className="flex justify-center px-4 py-12" id="sign-in-section">
            <div className="w-full max-w-md">
              <SignInForm />
            </div>
          </div>
        )
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

      <Suspense fallback={<ModalLoadingFallback />}>
        {showSettings && (
          <LazyGrammarProvider>
            <SettingsModal
              onClose={() => setShowSettings(false)}
            />
          </LazyGrammarProvider>
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
      </Suspense>
    </div>
  );
}

function ModalLoadingFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="status">
      <div className="app-card flex items-center gap-3 px-5 py-4 text-sm app-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[color:var(--ui-border)] border-t-[color:var(--ui-text)]" />
        Loading…
      </div>
    </div>
  );
}

export default BookLibrary;

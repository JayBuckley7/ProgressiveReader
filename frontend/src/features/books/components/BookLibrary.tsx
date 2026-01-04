import { useState, useEffect } from "react";
import { SettingsModal } from "@shared/components/SettingsModal";
import { BookCardHover } from "./BookCardHover";
import { FolderManager } from "./FolderManager";
import { FolderView } from "./FolderView";
import { TokenStatusWarning } from "@shared/components/TokenStatusWarning";
import { MassUploadModal } from "./MassUploadModal";
import { useAppData } from "@shared/contexts/AppDataContext";
import { useUser } from "@clerk/clerk-react";

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SignInForm } from "@shared/components/SignInForm";

interface BookLibraryProps {
  onSelectBook?: (bookId: string) => void;
}

function BookLibrary({ onSelectBook }: BookLibraryProps = {}) {
  const navigate = useNavigate();
  const { user: clerkUser } = useUser();
  const { t } = useTranslation();

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
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔄</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t("bookLibrary.googleConnecting.title")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t("bookLibrary.googleConnecting.description")}
          </p>
          <div className="flex justify-center mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
          <p className="text-sm text-gray-400 mb-4">{t("bookLibrary.googleConnecting.takingTooLong")}</p>
          <button
            onClick={async () => {
              console.log('Manual Google Drive connection requested');
              await connectToGoogleDriveAndLoad();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t("bookLibrary.googleConnecting.manualButton")}
          </button>
        </div>
      );
    } else {
      // User didn't sign in with Google - show explanation
      return (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📱</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t("bookLibrary.localMode.title")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t("bookLibrary.localMode.description")}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
            {t("bookLibrary.localMode.info")}
          </p>
        </div>
      );
    }
  };

  const {
    books,
    folders,
    isAuthenticated,
    signIn,
    uploadBook,
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
    <div className="container mx-auto px-4 py-8">
      {(isAuthenticated || books.length > 0) && (
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("bookLibrary.title")}</h1>
            {isAuthenticated && (
              <>
                <button
                  onClick={openCloudFolder}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={t("bookLibrary.buttons.openCloud")}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    console.log('sync library button clicked');
                    syncBooks();
                  }}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={t("bookLibrary.buttons.sync")}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 15a9 9 0 0014-3m0-4a9 9 0 00-14-3" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowFolderManager(true)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={t("bookLibrary.buttons.manageFolders")}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
              </>
            )}
          </div>

          <div className="flex gap-4 items-center">
            <button
              onClick={() => setShowMassUpload(true)}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t("bookLibrary.buttons.addBooks")}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
      {/* Main content rendering logic */}
      {isLoading ? (
        <div className="text-center py-16">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
          <p className="mt-4 text-gray-500">{t("bookLibrary.loading.description")}</p>
        </div>
      ) : !isAuthenticated && books.length === 0 ? (
        !isOnline && books.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="text-center">
              <div className="text-6xl mb-4 text-gray-400">📡</div>
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t("bookLibrary.offline.title", "No Offline Books Found")}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                {t("bookLibrary.offline.description", "You are offline and have no saved books. Please connect to the internet and sign in to access your library.")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-12" id="sign-in-section">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
                {t("bookLibrary.signInPrompt.title") || "Sign in to your library"}
              </h2>
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
        />
      ) : !isDriveConnected ? (
        renderNotConnectedState()
      ) : (isDriveBookLoading) && isDriveConnected ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t("bookLibrary.loading.title")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t("bookLibrary.loading.description")}
          </p>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t("bookLibrary.empty.title")}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t("bookLibrary.empty.description")}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
            {t("bookLibrary.empty.supportedFormats")}
          </p>
          <button
            onClick={() => setShowMassUpload(true)}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-hover flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("bookLibrary.buttons.uploadFirst")}
          </button>
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

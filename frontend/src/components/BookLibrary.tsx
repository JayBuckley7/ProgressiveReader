import { useState, useRef } from "react";
import { SettingsModal } from "./SettingsModal";
import { BookCardHover } from "./BookCardHover";
import { toast } from "sonner";
import { useStorageService } from "../hooks/useStorageService";
import { useGoogleDrive } from "../hooks/useGoogleDrive";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { GoogleDriveConnectButton } from "./GoogleDriveConnectButton";

interface BookLibraryProps {
  onSelectBook: (bookId: string) => void;
}

function BookLibrary({ onSelectBook }: BookLibraryProps) {

  const { books, isAuthenticated, signIn, uploadBook, deleteBook, updateBookCover, openCloudFolder, syncBooks, loadOfflineBooks, isLoading } = useStorageService();
  const { isDriveConnected } = useGoogleDrive();
  const isOnline = useOnlineStatus();

  const [offlineMode, setOfflineMode] = useState(false);

  // All book handling is delegated to the storage service.

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleContinueOffline = async () => {
    await loadOfflineBooks();
    setOfflineMode(true);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const supportedFormats = ['epub', 'txt', 'docx', 'pdf'];
    
    if (!fileExtension || !supportedFormats.includes(fileExtension)) {
      toast.error("Please select a supported file format (EPUB, TXT, DOCX, PDF)");
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Use the storage service's integrated upload function
      const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      
      const meta = {
        title: fileName,
        fileType: fileExtension
      };
      
      const uploadedBookMetadata = await uploadBook(file, meta);
      
      if (uploadedBookMetadata) {
        // All metadata handling is performed in the storage service. Any future
        // chapter processing will hook into that layer.

        setUploadProgress(100);
        toast.success(`"${uploadedBookMetadata.title}" uploaded successfully!`);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
          throw new Error("Upload did not return metadata.");
      }

    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload book");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Mobile-first responsive header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">My Library</h1>
          {!isOnline && (
            <span className="bg-gray-200 text-gray-700 text-xs font-semibold px-2.5 py-0.5 rounded-full dark:bg-gray-700 dark:text-gray-300">
              Offline
            </span>
          )}
          {isAuthenticated && isOnline && (
            <>
              <button
                onClick={openCloudFolder}
                className="hidden sm:block p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Open cloud storage folder"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
              <button
                onClick={syncBooks}
                className="hidden sm:block p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Sync library"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 15a9 9 0 0014-3m0-4a9 9 0 00-14-3" />
                </svg>
              </button>
            </>
          )}
        </div>
        
        <div className="flex gap-2 sm:gap-4 items-center justify-end">
          {!isAuthenticated && (
            <button
              onClick={signIn}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm sm:text-base"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.txt,.docx,.pdf"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isUploading}
          />
          {/* Improved Add Book button for mobile */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-2 sm:px-4 sm:py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 sm:gap-2 text-sm sm:text-base font-medium"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span className="hidden sm:inline">Processing... {uploadProgress}%</span>
                <span className="sm:hidden">{uploadProgress}%</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Add Book</span>
                <span className="sm:hidden">Add</span>
              </>
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile-friendly action buttons for authenticated users */}
      {isAuthenticated && isOnline && (
        <div className="flex sm:hidden gap-2 mb-4">
          <button
            onClick={openCloudFolder}
            className="flex-1 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            title="Open cloud storage folder"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Cloud
          </button>
          <button
            onClick={syncBooks}
            className="flex-1 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            title="Sync library"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 15a9 9 0 0014-3m0-4a9 9 0 00-14-3" />
            </svg>
            Sync
          </button>
        </div>
      )}

      {isUploading && (
        <div className="mb-6">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Processing your book... This may take a moment.
          </p>
        </div>
      )}

      {!isAuthenticated && !offlineMode ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔐</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Sign in to access your library
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Sign in to view and manage your books
          </p>
          <button
            onClick={signIn}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign In
          </button>
          <button
            onClick={handleContinueOffline}
            className="mt-4 text-sm text-primary underline"
          >
            Continue Offline
          </button>
        </div>
      ) : isLoading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">Loading your library...</p>
        </div>
      ) : !isDriveConnected && books.length === 0 && !offlineMode ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📤</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {isOnline ? 'Connect Google Drive for Cloud Storage' : 'Offline Mode'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {isOnline ? 
              'Connect Google Drive to sync your books across devices. You can still upload and read books without it.' :
              'You are currently offline. You can still upload and read books locally.'
            }
          </p>
          <div className="flex flex-col items-center gap-4">
            {isOnline && <GoogleDriveConnectButton />}
            <button onClick={handleContinueOffline} className="text-sm text-primary underline">
              Continue Offline
            </button>
            {isOnline && (
              <div className="text-sm text-gray-400">
                or
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-hover"
            >
              {isOnline ? 'Upload a Book to Get Started' : 'Upload a Book (Local Storage)'}
            </button>
          </div>
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No books yet
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Upload your first book file to get started
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
            Supported formats: EPUB, TXT, DOCX, PDF
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-hover"
          >
            Upload Your First Book
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {books.map((book) => (
            <BookCardHover
              key={book.id}
              book={book}
              onSelectBook={onSelectBook}
              onDeleteBook={deleteBook}
              onUpdateCover={updateBookCover}
            />
          ))}
        </div>
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onTranslate={() => {}}
          translating={false}
          isOnline={isOnline}
        />
      )}
    </div>
  );
}

export default BookLibrary;

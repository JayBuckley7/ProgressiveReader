import { useState, useRef } from "react";
import { SettingsModal } from "./SettingsModal";
import { BookCardHover } from "./BookCardHover";
import { FolderManager } from "./FolderManager";
import { FolderView } from "./FolderView";
import { TokenStatusWarning } from "./TokenStatusWarning";
import { toast } from "sonner";
import { useAppData } from "../contexts/AppDataContext";
import { GoogleDriveConnectButton } from "./GoogleDriveConnectButton";
import { useUser } from "@clerk/clerk-react";

import { useNavigate } from "react-router-dom";

interface BookLibraryProps {
  onSelectBook?: (bookId: string) => void;
}

function BookLibrary({ onSelectBook }: BookLibraryProps = {}) {
  const navigate = useNavigate();
  const { user: clerkUser } = useUser();

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
      // User signed in with Google - show auto-connecting message
      return (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔄</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Connecting to Google Drive
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Since you signed in with Google, we're automatically connecting to your Google Drive to load your books.
          </p>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      );
    } else {
      // User didn't sign in with Google - show explanation
      return (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📱</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Local Library Mode
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            You're using local storage. To sync your books across devices, sign in with Google next time.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
            You can still upload and read books - they'll be stored locally on this device.
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
    isDriveBookLoading
  } = useAppData();

  // All book handling is delegated to the storage service.

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showFolderManager, setShowFolderManager] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Library</h1>
          {isAuthenticated && (
            <>
              <button
                onClick={openCloudFolder}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Open cloud storage folder"
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
                title="Sync library"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 15a9 9 0 0014-3m0-4a9 9 0 00-14-3" />
                </svg>
              </button>
              <button
                onClick={() => setShowFolderManager(true)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Manage folders"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
            </>
          )}
        </div>
        
        <div className="flex gap-4 items-center">
          {!isAuthenticated && (
            <button
              onClick={signIn}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign In
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
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Processing... {uploadProgress}%
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Book
              </>
            )}
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

      {/* Token Status Warning */}
      <TokenStatusWarning />

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

      {!isAuthenticated ? (
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
        </div>
      ) : !isDriveConnected ? (
        renderNotConnectedState()
      ) : (isDriveBookLoading || isLoading) && books.length === 0 && isDriveConnected ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Loading your books...
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            We're fetching your library from Google Drive
          </p>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
        <FolderView
          books={books}
          folders={folders}
          onSelectBook={handleSelectBook}
          onDeleteBook={deleteBook}
          onUpdateCover={updateBookCover}
          onMoveBookToFolder={moveBookToFolder}
        />
      )}

      {showSettings && (
        <SettingsModal 
          onClose={() => setShowSettings(false)} 
          onTranslate={() => {}} 
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
    </div>
  );
}

export default BookLibrary;

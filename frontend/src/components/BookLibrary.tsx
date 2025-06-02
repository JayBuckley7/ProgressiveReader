import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useRef } from "react";
import { SettingsModal } from "./SettingsModal";
import { toast } from "sonner";
import { EpubProcessorWrapper } from "../lib/epubProcessor";
import { TextProcessorWrapper } from "../lib/textProcessor";
import { processBookChapters } from "../lib/utils";
import { useStorageService } from "../hooks/useStorageService";

interface BookLibraryProps {
  onSelectBook: (bookId: Id<"books">) => void;
}

function BookLibrary({ onSelectBook }: BookLibraryProps) {
  // Use the new storage service to fetch books from Firestore
  const { books, isAuthenticated, signIn, uploadBook } = useStorageService();
  
  const generateUploadUrl = useMutation(api.books.generateUploadUrl);
  const createBook = useMutation(api.books.create);
  const createChapter = useMutation(api.books.createChapter);
  const updateBookMetadata = useMutation(api.books.updateMetadata);
  const processEpub = useAction(api.epubProcessor.processEpubFile);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
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
      const uploadedBookMetadata = await uploadBook(file);
      
      if (uploadedBookMetadata) {
        // Now process chapters using a Convex action if needed, or client-side
        // Based on the structure, processing might still be a Convex action,
        // but creating/updating metadata is handled by storageService.
        // We should pass the *new* bookId and driveFileId to the processing step if needed.
        
        // The existing processBookChapters seems to handle the chapter creation/metadata update
        // within itself, possibly calling Convex mutations directly. This needs review.
        // If chapters are also going to Firestore, processBookChapters needs refactoring
        // to use storageService.saveChapter or similar, or we move processing client-side.
        
        // Assuming processBookChapters will be updated to use storageService or client-side logic:
        // await processBookChapters({
        //   file, // Might still need the file blob
        //   fileExtension,
        //   bookId: uploadedBookMetadata.id,
        //   bookTitle: uploadedBookMetadata.title,
        //   author: uploadedBookMetadata.author, // if extracted
        //   totalChapters: uploadedBookMetadata.totalChapters, // if extracted
        //   coverImageId: uploadedBookMetadata.coverImageId, // if extracted
        //   // Pass storageService methods if needed, or refactor processBookChapters
        // });

        // For now, let's assume storageService.uploadBook handles all initial metadata
        // and the follow-up processing step might just be for chapter content.
        // The original code had client-side processing followed by Convex mutations.
        // Let's rely on storageService.uploadBook handling metadata saving to Firestore.

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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Library</h1>
        
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
              Sign in with Google
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
            Sign in with Google to view and manage your books
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
            Sign in with Google
          </button>
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
            <div
              key={book.id}
              onClick={() => onSelectBook(book.id as Id<"books">)}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
            >
              <div className="aspect-[3/4] bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-white text-4xl">📖</div>
                )}
              </div>
              
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2">
                  {book.title}
                </h3>
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{book.fileType.toUpperCase()}</span>
                  <span>{book.totalChapters || 1} chapters</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {book.uploadedAt ? new Date(book.uploadedAt).toLocaleDateString() : 'Unknown date'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSettings && (
        <SettingsModal 
          onClose={() => setShowSettings(false)} 
          onTranslate={() => {}} 
          translating={false} 
        />
      )}
    </div>
  );
}

export default BookLibrary;

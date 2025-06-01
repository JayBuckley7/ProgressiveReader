import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useRef } from "react";
import { SettingsModal } from "./SettingsModal";
import { toast } from "sonner";
import { EpubProcessorWrapper } from "../lib/epubProcessor";
import { TextProcessorWrapper } from "../lib/textProcessor";
import { processBookChapters } from "../lib/utils";

interface BookLibraryProps {
  onSelectBook: (bookId: Id<"books">) => void;
}

export function BookLibrary({ onSelectBook }: BookLibraryProps) {
  const books = useQuery(api.books.list) || [];
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
      // Step 1: Upload file to storage
      const uploadUrl = await generateUploadUrl();
      setUploadProgress(20);
      
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = await result.json();
      setUploadProgress(40);

      // Step 2: Process file client-side to extract metadata
      let bookTitle = file.name.replace(/\.[^.]+$/, '');
      let author = undefined;
      let totalChapters = 1;
      let coverImageId = undefined;

      try {
        const arrayBuffer = await file.arrayBuffer();
        setUploadProgress(60);

        if (fileExtension === 'epub') {
          const processor = new EpubProcessorWrapper();
          const loaded = await processor.loadBook(arrayBuffer);
          
          if (loaded) {
            bookTitle = processor.getBookTitle();
            totalChapters = processor.getTotalChapters();
            
            // Try to extract cover
            try {
              const coverBlob = await processor.getCoverBlob();
              if (coverBlob) {
                const coverUploadUrl = await generateUploadUrl();
                const coverResult = await fetch(coverUploadUrl, {
                  method: "POST",
                  headers: { "Content-Type": coverBlob.type },
                  body: coverBlob,
                });
                if (coverResult.ok) {
                  const { storageId: coverStorageId } = await coverResult.json();
                  coverImageId = coverStorageId;
                }
              }
            } catch (coverError) {
              console.warn("Failed to extract cover:", coverError);
            }
          }
        } else {
          // Handle text files
          const processor = new TextProcessorWrapper();
          const loaded = await processor.loadBook(arrayBuffer, { fileType: fileExtension });
          
          if (loaded) {
            totalChapters = processor.getTotalChapters();
          }
        }
      } catch (processingError) {
        console.warn("Client-side processing failed, using defaults:", processingError);
      }

      setUploadProgress(80);

      // Step 3: Create book record
      const bookId = await createBook({
        title: bookTitle,
        author,
        language: "ja", // Default to Japanese
        totalChapters,
        epubFileId: storageId,
        coverImageId,
      });

      setUploadProgress(90);

      // Step 4: Process and store chapters
      await processBookChapters({
        file,
        fileExtension,
        bookId,
        bookTitle,
        author,
        totalChapters,
        coverImageId,
        createChapter,
        updateBookMetadata,
      });

      setUploadProgress(100);
      toast.success(`"${bookTitle}" uploaded successfully!`);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
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

      {books.length === 0 ? (
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
              key={book._id}
              onClick={() => onSelectBook(book._id)}
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
                {book.author && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    by {book.author}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{book.language.toUpperCase()}</span>
                  <span>{book.totalChapters} chapters</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

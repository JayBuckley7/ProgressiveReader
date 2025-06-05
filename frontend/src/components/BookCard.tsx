import { useState, useRef, useEffect } from 'react';
import { useStorageService } from '../hooks/useStorageService';
import { BookReader } from "./BookReader";
import { BookMetadata, ReadingProgress } from '../services/storageService';

interface Book {
  _id: string;
  title: string;
  author?: string;
  language: string;
  coverUrl?: string | null;
  totalPages?: number;
  description?: string;
  fileId?: string;
}

interface BookCardProps {
  book: BookMetadata;
  onSelectBook: (bookId: string) => void;
  onDeleteBook: (bookId: string) => Promise<void>;
  onUpdateCover: (bookId: string, coverFile: File) => Promise<void>;
}

export function BookCard({ book, onSelectBook, onDeleteBook, onUpdateCover }: BookCardProps) {
  const [showReader, setShowReader] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getReadingProgress } = useStorageService();
  const [progress, setProgress] = useState<ReadingProgress | null>(null);

  useEffect(() => {
    getReadingProgress(book.id).then(setProgress);
  }, [book.id, getReadingProgress]);
  
  const progressPercentage = progress && book.totalPages 
    ? Math.round((progress.currentPage / progress.totalPages) * 100)
    : 0;

  const handleOpenBook = () => {
    if (book.fileId) {
      setShowReader(true);
    } else {
      console.log("No file available for:", book.title);
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDeleteBook(book.id as string);
    } catch (error) {
      console.error('Error deleting book:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleChangeCoverClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setIsUpdatingCover(true);
    try {
      await onUpdateCover(book.id as string, file);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error updating cover:', error);
    } finally {
      setIsUpdatingCover(false);
    }
  };

  const handleCardClick = () => {
    onSelectBook(book.id as string);
  };

  if (showReader) {
    return <BookReader bookId={book.id} onClose={() => setShowReader(false)} />;
  }

  return (
    <div
      className="book-item-link relative group cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      <div className="book-item bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden transform hover:-translate-y-1">
        {/* Cover Wrapper */}
        <div className="book-cover-wrapper relative aspect-[3/4] bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-white text-4xl">📖</div>
          )}

          {/* Change Cover Button - appears on hover */}
          <button
            onClick={handleChangeCoverClick}
            disabled={isUpdatingCover}
            className={`
              btn-change-cover absolute bottom-2 right-2 z-30
              bg-gray-600 hover:bg-gray-500 text-white border-none
              px-2 py-1 rounded-full text-sm cursor-pointer
              opacity-80 hover:opacity-100 transition-all duration-200
              ${isHovered ? 'flex items-center justify-center' : 'hidden'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            title={`Change cover for "${book.title}"`}
          >
            {isUpdatingCover ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              '📷'
            )}
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverFileChange}
            className="hidden"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Book Info */}
        <div className="p-4">
          <h3 className="book-item-title font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2">
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

        {/* Delete Button - appears on hover */}
        <button
          onClick={handleDeleteClick}
          disabled={isDeleting}
          className={`
            delete-btn absolute top-2 right-2 z-10
            bg-red-500 hover:bg-red-600 text-white border-none
            px-2 py-1 rounded-full text-sm cursor-pointer
            opacity-80 hover:opacity-100 transition-all duration-200
            ${isHovered ? 'block' : 'hidden'}
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          title={`Delete "${book.title}"`}
        >
          {isDeleting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            '✕'
          )}
        </button>
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { BookMetadata, Folder } from '~/types';

interface BookCardHoverProps {
  book: BookMetadata;
  onSelectBook: (bookId: string) => void;
  onDeleteBook: (bookId: string) => Promise<void>;
  onUpdateCover: (bookId: string, coverFile: File) => Promise<string | undefined>;
  onMoveToFolder?: (bookId: string, folderId: string | null) => void;
  availableFolders?: Folder[];
  currentFolderId?: string | null;
}

export function BookCardHover({ 
  book, 
  onSelectBook, 
  onDeleteBook, 
  onUpdateCover, 
  onMoveToFolder,
  availableFolders = [],
  currentFolderId
}: BookCardHoverProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleMoveToFolder = (folderId: string | null) => {
    console.log('handleMoveToFolder called with:', folderId, 'onMoveToFolder exists:', !!onMoveToFolder);
    if (onMoveToFolder) {
      onMoveToFolder(book.id, folderId);
    }
    setShowFolderMenu(false);
  };

  const getCurrentFolderName = () => {
    if (!currentFolderId) return 'No folder';
    const folder = availableFolders.find(f => f.id === currentFolderId);
    return folder ? folder.name : 'Unknown folder';
  };

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

        {/* Folder button - appears on hover */}
        {onMoveToFolder && (
          <div className="absolute top-2 left-2 z-50">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowFolderMenu(!showFolderMenu);
              }}
              className={`
                bg-blue-500 hover:bg-blue-600 text-white border-none
                px-2 py-1 rounded-full text-sm cursor-pointer
                opacity-80 hover:opacity-100 transition-all duration-200
                ${isHovered ? 'block' : 'hidden'}
              `}
              title={`Move "${book.title}" to folder`}
            >
              📁
            </button>

          {/* Folder Menu Dropdown */}
          {showFolderMenu && (
            <div className="absolute top-8 left-2 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg min-w-48">
              <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                <div className="text-xs text-gray-500 dark:text-gray-400">Current: {getCurrentFolderName()}</div>
              </div>
              <div className="py-1">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleMoveToFolder(null);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    !currentFolderId ? 'bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  📂 No folder
                </button>
                {availableFolders.length > 0 ? (
                  availableFolders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleMoveToFolder(folder.id);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        currentFolderId === folder.id ? 'bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      📁 {folder.name}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                    No folders available
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}


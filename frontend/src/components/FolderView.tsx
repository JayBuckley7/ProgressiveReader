import React, { useState } from 'react';
import { BookMetadata, Folder } from '../types';
import { BookCardHover } from './BookCardHover';

interface FolderViewProps {
  books: BookMetadata[];
  folders: Folder[];
  onSelectBook: (bookId: string) => void;
  onDeleteBook: (bookId: string) => void;
  onUpdateCover: (bookId: string, coverFile: File) => void;
  onMoveBookToFolder: (bookId: string, folderId: string | null) => void;
}

export function FolderView({
  books,
  folders,
  onSelectBook,
  onDeleteBook,
  onUpdateCover,
  onMoveBookToFolder
}: FolderViewProps) {
  const handleMoveBook = (bookId: string, targetFolderId: string | null) => {
    onMoveBookToFolder(bookId, targetFolderId);
  };

  // Group books by folder for debugging
  const booksByFolder = books.reduce((acc, book) => {
    const folderId = book.folderId || 'root';
    if (!acc[folderId]) {
      acc[folderId] = [];
    }
    acc[folderId].push(book);
    return acc;
  }, {} as Record<string, BookMetadata[]>);

  const [collapsedShelves, setCollapsedShelves] = useState<Set<string>>(new Set());

  const toggleShelf = (shelfId: string) => {
    const newCollapsed = new Set(collapsedShelves);
    if (newCollapsed.has(shelfId)) {
      newCollapsed.delete(shelfId);
    } else {
      newCollapsed.add(shelfId);
    }
    setCollapsedShelves(newCollapsed);
  };

  const renderShelfView = () => {
    // Create sections for each folder + uncategorized books
    const sections = [];
    
    // Debug logs removed to prevent spam on every render
    
    // Uncategorized books (no folder) - only show if there are books
    const uncategorizedBooks = books.filter(book => !book.folderId);
    if (uncategorizedBooks.length > 0) {
      sections.push({
        title: 'My Books',
        books: uncategorizedBooks,
        id: 'uncategorized',
        isEmpty: false,
        icon: '📚'
      });
    }

    // Books grouped by folder - only show shelves with books
    folders.forEach(folder => {
      const folderBooks = books.filter(book => book.folderId === folder.id);
      if (folderBooks.length > 0) {
        sections.push({
          title: folder.name,
          books: folderBooks,
          id: folder.id,
          isEmpty: false,
          icon: '📁'
        });
      }
    });

    // FALLBACK: If we have books with folder IDs but no folder metadata, create virtual folders
    if (folders.length === 0 && books.some(book => book.folderId)) {
      console.warn('[FolderView] 🚨 FALLBACK: Books have folder IDs but no folder metadata found');
      // Group books by their folder IDs and create virtual folders
      const folderGroups = books.reduce((acc, book) => {
        if (book.folderId) {
          if (!acc[book.folderId]) {
            acc[book.folderId] = [];
          }
          acc[book.folderId].push(book);
        }
        return acc;
      }, {} as Record<string, typeof books>);

      // Create sections for each folder group
      Object.entries(folderGroups).forEach(([folderId, folderBooks], index) => {
        sections.push({
          title: `📁 Folder ${index + 1}`,
          books: folderBooks,
          id: folderId,
          isEmpty: false,
          icon: '📁'
        });
      });
    }

    return (
      <div className="space-y-6">
        {sections.map((shelf) => {
          const isCollapsed = collapsedShelves.has(shelf.id);
          
          return (
            <div key={shelf.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Modern Shelf Header */}
              <button
                onClick={() => toggleShelf(shelf.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                                 <div className="flex items-center gap-4">
                   <div className="text-left">
                     <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                       {shelf.title}
                     </h2>
                     <p className="text-sm text-gray-500 dark:text-gray-400">
                       {shelf.books.length} book{shelf.books.length !== 1 ? 's' : ''}
                     </p>
                   </div>
                 </div>
                
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                    {shelf.books.length}
                  </div>
                  <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                      isCollapsed ? 'rotate-0' : 'rotate-90'
                    }`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
              
                             {/* Collapsible Shelf Content */}
               {!isCollapsed && (
                 <div className="px-6 pb-6">
                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
                     {shelf.books.map((book) => (
                       <div key={book.id} className="group">
                         <BookCardHover
                           book={book}
                           onSelectBook={onSelectBook}
                           onDeleteBook={onDeleteBook}
                           onUpdateCover={onUpdateCover}
                           onMoveToFolder={handleMoveBook}
                           availableFolders={folders}
                           currentFolderId={book.folderId || null}
                         />
                       </div>
                     ))}
                   </div>
                 </div>
               )}
            </div>
          );
        })}
        
        {books.length === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Your library is empty
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Upload your first book to start building your digital library and organize it with folders
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
            {/* Render shelf view */}
      {renderShelfView()}
    </div>
  );
} 
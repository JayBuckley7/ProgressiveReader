import React, { useState } from 'react';
import { BookMetadata, Folder } from '~/types';
import { BookCardHover } from './BookCardHover';

interface FolderViewProps {
  books: BookMetadata[];
  folders: Folder[];
  onSelectBook: (bookId: string) => void;
  onDeleteBook: (bookId: string) => void;
  onUpdateCover: (bookId: string, coverFile: File) => void;
  onMoveBookToFolder: (bookId: string, folderId: string | null) => void;
  density?: "comfortable" | "compact";
}

export function FolderView({
  books,
  folders,
  onSelectBook,
  onDeleteBook,
  onUpdateCover,
  onMoveBookToFolder,
  density = "comfortable"
}: FolderViewProps) {
  const handleMoveBook = (bookId: string, targetFolderId: string | null) => {
    onMoveBookToFolder(bookId, targetFolderId);
  };

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
        isEmpty: false
      });
    }

    // Books grouped by folder - show folders even if empty (for navigation parity)
    folders.forEach(folder => {
      const folderBooks = books.filter(book => book.folderId === folder.id);
      sections.push({
        title: folder.name,
        books: folderBooks,
        id: folder.id,
        isEmpty: folderBooks.length === 0
      });
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
          title: `Folder ${index + 1}`,
          books: folderBooks,
          id: folderId,
          isEmpty: false
        });
      });
    }

    return (
      <div className="space-y-5">
        {sections.map((shelf) => {
          const isCollapsed = collapsedShelves.has(shelf.id);
          
          return (
            <div key={shelf.id} className="app-card overflow-visible">
              {/* Shelf Header */}
              <button
                onClick={() => toggleShelf(shelf.id)}
                aria-expanded={!isCollapsed}
                className={`w-full px-5 py-3 flex items-center justify-between transition-colors hover:bg-[var(--ui-surface-alt)] ${
                  isCollapsed
                    ? "rounded-tl-[10px] rounded-tr-[8px] rounded-bl-[6px] rounded-br-[8px]"
                    : "rounded-tl-[10px] rounded-tr-[8px]"
                }`}
              >
                <div className="text-left">
                  <h2 className="text-base sm:text-lg font-semibold">{shelf.title}</h2>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="app-chip whitespace-nowrap">
                    {shelf.books.length} book{shelf.books.length !== 1 ? 's' : ''}
                  </div>
                  <svg 
                    className={`w-5 h-5 app-muted transition-transform duration-200 ${
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
                 <div className="px-5 pb-5">
                   {shelf.books.length === 0 ? (
                     <div className="text-sm app-muted py-3">
                       No books in this folder yet.
                     </div>
                   ) : (
                     <div
                       className={`grid gap-4 ${
                         density === "compact"
                           ? "grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-9"
                           : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8"
                       }`}
                     >
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
                             density={density}
                           />
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               )}
            </div>
          );
        })}
        
       {books.length === 0 && (
          <div className="text-center py-16">
            <div className="mx-auto mb-6 h-16 w-16 book-cover-placeholder rounded-lg flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">
              Your library is empty
            </h2>
            <p className="app-muted mb-6 max-w-md mx-auto">
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

import { useState, useEffect } from 'react';
import { storageService, BookMetadata, ReadingProgress } from '../lib/storageService';
import { User as FirebaseUser } from 'firebase/auth';
import { toast } from 'sonner';

export function useStorageService() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [books, setBooks] = useState<BookMetadata[]>([]);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = storageService.onAuthStateChange((user) => {
      setUser(user);
      setIsLoading(false);
      
      // Load user's books when authenticated
      if (user) {
        loadUserBooks();
      } else {
        setBooks([]);
      }
    });

    return unsubscribe;
  }, []);

  const loadUserBooks = async () => {
    try {
      const userBooks = await storageService.getUserBooks();
      setBooks(userBooks);
    } catch (error) {
      console.error('Error loading books:', error);
      toast.error('Failed to load your books');
    }
  };

  const signIn = async () => {
    try {
      setIsLoading(true);
      await storageService.signInWithGoogle();
      toast.success('Signed in successfully!');
    } catch (error: any) {
      console.error('Sign in error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, no need to show error
        return;
      }
      toast.error('Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await storageService.signOut();
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('Failed to sign out');
    }
  };

  const uploadBook = async (file: File, title?: string): Promise<BookMetadata | null> => {
    if (!user) {
      toast.error('Please sign in to upload books');
      return null;
    }

    try {
      const bookId = crypto.randomUUID();
      const bookTitle = title || file.name.replace(/\.[^/.]+$/, '');
      
      // Upload to Google Drive
      toast.loading('Uploading book to Google Drive...', { id: 'upload' });
      const driveFileId = await storageService.uploadBookToDrive(file, {
        id: bookId,
        title: bookTitle
      });

      // Save metadata to Firestore
      const metadata: BookMetadata = {
        id: bookId,
        title: bookTitle,
        driveFileId,
        fileType: file.name.split('.').pop() || 'epub',
        uploadedAt: new Date(),
        userId: user.uid
      };

      await storageService.saveBookMetadata(metadata);
      
      // Reload books list
      await loadUserBooks();
      
      toast.success('Book uploaded successfully!', { id: 'upload' });
      return metadata;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload book', { id: 'upload' });
      return null;
    }
  };

  const downloadBook = async (book: BookMetadata): Promise<Blob | null> => {
    if (!user || !book.driveFileId) {
      toast.error('Cannot download book');
      return null;
    }

    try {
      toast.loading('Downloading book...', { id: 'download' });
      const blob = await storageService.downloadBookFromDrive(book.driveFileId);
      toast.success('Book downloaded!', { id: 'download' });
      return blob;
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download book', { id: 'download' });
      return null;
    }
  };

  const deleteBook = async (bookId: string) => {
    if (!user) return;

    try {
      await storageService.deleteBook(bookId);
      await loadUserBooks();
      toast.success('Book deleted successfully');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete book');
    }
  };

  const getProgress = async (bookId: string): Promise<ReadingProgress | null> => {
    if (!user) {
      // For non-authenticated users, get from IndexedDB
      return storageService.getFromIndexedDB('progress', bookId);
    }
    
    return storageService.getReadingProgress(bookId);
  };

  const saveProgress = async (bookId: string, chapter: number, position: number) => {
    const progress: ReadingProgress = {
      bookId,
      userId: user?.uid || 'anonymous',
      currentChapter: chapter,
      currentPosition: position,
      lastUpdated: new Date()
    };

    if (!user) {
      // Save to IndexedDB for non-authenticated users
      await storageService.saveToIndexedDB('progress', progress);
    } else {
      await storageService.saveReadingProgress(progress);
    }
  };

  return {
    // Auth state
    user,
    isAuthenticated: !!user,
    isLoading,
    
    // Auth methods
    signIn,
    signOut,
    
    // Book methods
    books,
    uploadBook,
    downloadBook,
    deleteBook,
    
    // Progress methods
    getProgress,
    saveProgress,
    
    // Direct access to storage service
    storageService
  };
} 
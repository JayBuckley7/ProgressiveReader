import { useState, useEffect } from 'react';
import { storageService, BookMetadata, ReadingProgress } from '../services/storageService';
import { User as FirebaseUser } from 'firebase/auth';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';

export function useStorageService() {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [books, setBooks] = useState<BookMetadata[]>([]);

  useEffect(() => {
    // Sync Clerk auth state with storage service
    if (clerkLoaded) {
      if (clerkUser) {
        // User is signed in via Clerk
        const provider =
          clerkUser.externalAccounts?.[0]?.provider?.toLowerCase() || 'email';
        const firebaseUser = {
          uid: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || '',
          displayName: clerkUser.fullName || clerkUser.username || '',
          providerData: [{ providerId: provider }],
        } as FirebaseUser;
        setUser(firebaseUser);
        // Ensure user exists in Firestore
        void storageService.ensureUserDocument(firebaseUser);
        // Notify storage service about the authenticated user
        storageService.onAuthStateChange(() => {});
        loadUserBooks();
      } else {
        // User is not signed in
        setUser(null);
        setBooks([]);
      }
      setIsLoading(false);
    }
  }, [clerkUser, clerkLoaded]);

  const loadUserBooks = async () => {
    if (!storageService.getCurrentUser()) {
        setBooks([]);
        return;
    }
    setIsLoading(true);
    try {
      const userBooks = await storageService.getUserBooks();
      setBooks(userBooks);
    } catch (error) {
      console.error('Error loading books:', error);
      toast.error('Failed to load your books');
      setBooks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async () => {
    // Authentication is handled by Clerk's <SignIn /> component
    console.log("Sign-in is handled by Clerk's UI components");
    toast.info('Please use the sign-in form to authenticate');
  };

  const signOut = async () => {
    // Sign-out is handled by Clerk's <SignOutButton />
    console.log("Sign-out is handled by Clerk's UI components");
    toast.info('Please use the sign-out button to log out');
  };

  const uploadBook = async (file: File, title?: string): Promise<BookMetadata | null> => {
    if (!user) {
      toast.error('Please sign in to upload books');
      return null;
    }
    setIsLoading(true);
    try {
      const bookTitle = title || file.name.replace(/\.[^/.]+$/, '');
      
      const metadata = await storageService.uploadBook(file, {
        title: bookTitle,
        fileType: file.name.split('.').pop()?.toLowerCase() || 'epub',
      });
      
      if (metadata) {
        await loadUserBooks();
        toast.success(`"${metadata.title}" uploaded successfully!`);
        return metadata;
      }
      return null;
    } catch (error: any) {
      console.error('Upload error in hook:', error);
      toast.error(error.message || 'Failed to upload book');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const downloadBook = async (book: BookMetadata): Promise<Blob | null> => {
    if (!user) {
      toast.error('Please sign in to download books');
      return null;
    }
    if (!book.id) {
      toast.error('Book ID is missing, cannot download.');
      return null;
    }
    setIsLoading(true);
    try {
      toast.loading('Downloading book...', { id: 'download-' + book.id });
      const blob = await storageService.downloadBookFromDrive(book.id);
      toast.success('Book downloaded!', { id: 'download-' + book.id });
      return blob;
    } catch (error: any) {
      console.error('Download error in hook:', error);
      toast.error(error.message || 'Failed to download book', { id: 'download-' + book.id });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteBook = async (bookId: string) => {
    if (!user) return;
    setIsLoading(true);
    try {
      await storageService.deleteBook(bookId);
      await loadUserBooks();
      toast.success('Book deleted successfully');
    } catch (error: any) {
      console.error('Delete error in hook:', error);
      toast.error(error.message || 'Failed to delete book');
    } finally {
      setIsLoading(false);
    }
  };

  const getProgress = async (bookId: string): Promise<ReadingProgress | null> => {
    if (!user) {
      return storageService.getFromIndexedDB('progress', bookId);
    }
    try {
      return await storageService.getReadingProgress(bookId);
    } catch (error: any) {
      console.error('Get progress error:', error);
      toast.error(error.message || 'Failed to get reading progress');
      return null;
    }
  };

  const saveProgress = async (bookId: string, chapter: number, position: number) => {
    const progressData: ReadingProgress = {
      bookId,
      userId: user?.uid || 'anonymous',
      currentChapter: chapter,
      currentPosition: position,
      lastUpdated: new Date()
    };

    if (!user) {
      await storageService.saveToIndexedDB('progress', progressData);
    } else {
      try {
        await storageService.saveReadingProgress(progressData);
      } catch (error: any) {
        console.error('Save progress error:', error);
        toast.error(error.message || 'Failed to save reading progress');
      }
    }
  };

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    signIn,
    signOut,
    books,
    uploadBook,
    downloadBook,
    deleteBook,
    getProgress,
    saveProgress,
    storageService
  };
} 
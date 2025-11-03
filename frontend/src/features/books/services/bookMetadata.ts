import { BookMetadata, Folder } from '~/types';
import { gDriveService, BOOK_FILE_EXTENSIONS } from '@integrations/googleDrive/gdriveService';
import { authManager } from '@shared/services/authManager';
import { removeCachedCover, removeCoverForFile } from '@integrations/googleDrive/services/driveCache';
import { bookCacheService } from './bookCache';
import { bookStorageService } from './bookStorage';
import { processPDFWithOCR, OCRProgressCallback } from './ocrApi';
import { toast } from 'sonner';

declare global {
    interface Window {
        Clerk: any;
    }
}

type Provider = 'google' | 'apple' | 'microsoft' | 'email';

/**
 * Book metadata service for managing book metadata operations
 */
class BookMetadataService {
    private detectProviderFromClerkUser(clerkUser: any): Provider {
        // Detect provider from Clerk user's external accounts
        if (!clerkUser?.externalAccounts?.length) {
            console.log('No external accounts found, defaulting to email provider');
            return 'email';
        }

        // Get the first external account's provider
        const provider = clerkUser.externalAccounts[0]?.provider;
        console.log('Detected Clerk provider:', provider);
        
        switch (provider) {
            case 'google':
                return 'google';
            case 'apple':
                return 'apple';
            case 'microsoft':
                return 'microsoft';
            default:
                return 'email';
        }
    }

    /**
     * Upload book to user's cloud storage - NEVER to our servers
     * Only metadata pointers are stored in our backend
     */
    async uploadBook(
        file: File, 
        meta: {title: string; fileType: string; cover?: Blob; processOCR?: boolean}, 
        clerkUser?: any,
        onOCRProgress?: OCRProgressCallback
    ): Promise<BookMetadata> {
        console.log('Uploading book to user\'s cloud storage. Privacy-first: no content stored in our backend.');
        
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                try {
                    // Check connection using centralized auth manager
                    const isAuthenticated = await authManager.ensureAuthenticated();
                    if (!isAuthenticated) {
                        throw new Error('Failed to authenticate with Google Drive');
                    }

                    // Extract cover image from EPUB if file type is epub and no cover provided
                    let coverBlob = meta.cover;
                    
                    if (!coverBlob && meta.fileType === 'epub') {
                        console.log('Attempting to extract cover from EPUB file...');
                        try {
                            const extractedCover = await bookStorageService.extractCoverFromEpub(file);
                            if (extractedCover) {
                                coverBlob = extractedCover;
                                console.log('✅ Cover extracted from EPUB successfully');
                            } else {
                                console.log('📖 No cover found in EPUB file');
                            }
                        } catch (error) {
                            console.warn('⚠️ Failed to extract cover from EPUB:', error);
                        }
                    } else if (!coverBlob && meta.fileType === 'pdf') {
                        const extracted = await bookStorageService.extractCoverFromPdf(file);
                        if (extracted) coverBlob = extracted;
                    }

                    // Process PDF with OCR if requested
                    let fileToUpload = file;
                    if (meta.processOCR && meta.fileType === 'pdf') {
                        try {
                            console.log('Processing PDF with OCR...');
                            fileToUpload = await processPDFWithOCR(file, onOCRProgress);
                            console.log('✅ PDF processed with OCR successfully');
                        } catch (error) {
                            console.error('OCR processing failed:', error);
                            toast.error('OCR processing failed. Uploading original PDF.');
                            // Fallback: continue with original file
                        }
                    }

                    // Upload the book file
                    const bookResult = await gDriveService.uploadFile(
                        fileToUpload.name,
                        fileToUpload,
                        fileToUpload.type || 'application/epub+zip'
                    );
                    
                    if (!bookResult) {
                        throw new Error('Failed to upload book to Google Drive');
                    }

                    let coverImageId: string | undefined;
                    
                    // Upload cover image if available
                    if (coverBlob) {
                        const coverFileName = `${meta.title}_cover.jpg`;
                        const coverResult = await gDriveService.uploadFile(
                            coverFileName,
                            coverBlob,
                            'image/jpeg'
                        );
                        
                        if (coverResult) {
                            coverImageId = coverResult.id;
                            console.log('✅ Cover image uploaded successfully');
                        } else {
                            console.warn('⚠️ Failed to upload cover image, but book upload succeeded');
                        }
                    }

                    // Add metadata to the metadata.json file
                    const metadataSuccess = await gDriveService.addBookMetadata(bookResult.id, {
                        title: meta.title,
                        fileName: fileToUpload.name,
                        fileType: meta.fileType,
                        coverImageId: coverImageId,
                        uploadedAt: new Date().toISOString()
                    });

                    if (!metadataSuccess) {
                        console.warn('⚠️ Failed to update metadata file, but book upload succeeded');
                    }

                    const bookMetadata: BookMetadata = {
                        id: bookResult.id,
                        title: meta.title,
                        fileType: meta.fileType,
                        driveFileId: bookResult.id,
                        coverImageId: coverImageId,
                        coverUrl: coverImageId ? `https://drive.google.com/thumbnail?id=${coverImageId}&sz=w400-h600` : undefined,
                        uploadedAt: new Date(),
                        userId: 'current-user',
                        cloudProvider: 'google',
                        folderId: undefined // New books start without a folder
                    };

                    console.log('✅ Book uploaded to user\'s cloud storage successfully. Privacy-first: no metadata stored in our backend.');
            
                    // Clear cache since book list has changed
                    bookCacheService.clearBookListCache();
            
                    return bookMetadata;

                } catch (error: any) {
                    console.error('Google Drive upload failed:', error);
                    throw new Error(`Failed to upload to Google Drive: ${error.message || 'Unknown error'}`);
                }
                
            case 'apple':
                // TODO: Implement iCloud upload
                throw new Error('iCloud upload not yet implemented');
                
            case 'microsoft':
                // TODO: Implement OneDrive upload
                throw new Error('OneDrive upload not yet implemented');
                
            default:
                throw new Error(`Unsupported cloud provider: ${provider}`);
        }
    }

    async getUserBooks(onCoverReady?: (bookId: string, coverUrl: string) => void): Promise<BookMetadata[]> {
        console.log('getUserBooks: Fetching book list from user\'s Google Drive...');
        
        try {
            // CRITICAL: Check Clerk authentication first before accessing Google Drive
            if (typeof window !== 'undefined' && window.Clerk) {
                const clerkUser = window.Clerk.user;
                const isClerkSignedIn = window.Clerk.session !== null;
                
                if (!clerkUser || !isClerkSignedIn) {
                    console.log('getUserBooks: Clerk user not authenticated, skipping Google Drive access');
                    return [];
                }
            } else {
                console.log('getUserBooks: Clerk not available, skipping Google Drive access');
                return [];
            }

            // Check if user is signed in to Google Drive
            if (!gDriveService.isSignedIn()) {
                console.log('User not signed in to Google Drive');
                return [];
            }

            // Check cache first to prevent redundant API calls
            const cachedBooks = bookCacheService.getBookListCache();
            if (cachedBooks) {
                // Update books with current cached cover URLs and trigger callbacks
                const updatedBooks = cachedBooks.map(book => {
                    const cachedCoverUrl = bookCacheService.getCachedCoverUrl(book.id);
                    const updatedBook = cachedCoverUrl ? { ...book, coverUrl: cachedCoverUrl } : book;
                    
                    // Trigger callback for books with covers
                    if (onCoverReady && updatedBook.coverUrl) {
                        onCoverReady(book.id, updatedBook.coverUrl);
                    } else if (onCoverReady && !updatedBook.coverUrl && book.coverImageId) {
                        // Start async download for books without cached covers
                        bookCacheService.downloadCoverAsync(book.id, book.coverImageId, book.title, onCoverReady);
                    }
                    
                    return updatedBook;
                });
                
                return updatedBooks;
            }

            // Get metadata.json file which contains book-to-cover mappings
            const metadataInfo = await gDriveService.getMetadataFile();
            if (!metadataInfo) {
                console.log('No metadata file found, returning empty list');
                return [];
            }

            const { data: metadata } = metadataInfo;
            const bookEntries = metadata.books || {};
            const coverEntries = metadata.covers || {};

            console.log('Found book entries in metadata:', Object.keys(bookEntries).length);

            // Get list of files from user's Google Drive app folder to verify they still exist
            const driveFiles = await gDriveService.listFiles();
            const driveFileIds = new Set(driveFiles.map(file => file.id));

            // Convert book entries to BookMetadata, filtering out deleted files
            const books: BookMetadata[] = [];
            const coverDownloadTasks: Promise<void>[] = [];
            
            for (const [bookFileId, bookData] of Object.entries(bookEntries)) {
                const bookMeta = bookData as any;
                const extFromMeta = (bookMeta.fileType || bookMeta.fileName?.split('.').pop() || '').toLowerCase();

                if (!BOOK_FILE_EXTENSIONS.includes(extFromMeta)) {
                    console.log(`Skipping non-book entry ${bookMeta.fileName || bookFileId}`);
                    continue;
                }

                // Skip if the book file no longer exists in Drive
                if (!driveFileIds.has(bookFileId)) {
                    console.log(`Book file ${bookFileId} no longer exists in Drive, skipping`);
                    continue;
                }

                // Get the actual file info from Drive for additional details
                const driveFile = driveFiles.find(file => file.id === bookFileId);
                if (!driveFile) continue;

                const bookMetadata = bookData as any;
                const coverImageId = coverEntries[bookFileId];
                
                // Create book metadata, using cached cover URL if available
                const cachedCoverUrl = bookCacheService.getCachedCoverUrl(bookFileId);
                const book: BookMetadata = {
                    id: bookFileId,
                    title: bookMetadata.title || driveFile.name.replace(/\.[^/.]+$/, ''), // fallback to filename without extension
                    fileType: bookMetadata.fileType || driveFile.name.split('.').pop()?.toLowerCase() || 'unknown',
                    driveFileId: bookFileId,
                    coverImageId: coverImageId,
                    coverUrl: cachedCoverUrl || undefined, // Use cached URL if available, convert null to undefined
                    uploadedAt: bookMetadata.uploadedAt ? new Date(bookMetadata.uploadedAt) : new Date(driveFile.modifiedTime || Date.now()),
                    userId: 'current-user', // We don't store user ID since we're privacy-first
                    cloudProvider: 'google' as const,
                    folderId: bookMetadata.folderId || undefined
                };

                books.push(book);

                // Start async cover download only if we don't have a cached cover and callback is provided
                if (coverImageId && driveFileIds.has(coverImageId) && onCoverReady) {
                    if (!cachedCoverUrl) {
                        console.log(`[Cover Debug] Initiating cover download for book: ${bookMetadata.title} (ID: ${bookFileId})`);
                        const coverTask = bookCacheService.downloadCoverAsync(bookFileId, coverImageId, bookMetadata.title, onCoverReady);
                        coverDownloadTasks.push(coverTask);
                    } else {
                        // Immediately call the callback with the cached URL
                        onCoverReady(bookFileId, cachedCoverUrl);
                    }
                } else {
                    if (!coverImageId) {
                        console.log(`[Cover Debug] No cover image ID for book: ${bookMetadata.title}`);
                    } else if (!driveFileIds.has(coverImageId)) {
                        console.log(`[Cover Debug] Cover image ID not found in drive files for book: ${bookMetadata.title} (CoverID: ${coverImageId})`);
                    } else if (!onCoverReady) {
                        console.log(`[Cover Debug] No onCoverReady callback provided for book: ${bookMetadata.title}`);
                    }
                }
            }

            console.log(`Processed ${books.length} books from metadata (covers downloading in background)`);
            
            // Log summary of books with/without covers
            const booksWithCovers = books.filter(book => book.coverImageId);
            const booksWithoutCovers = books.filter(book => !book.coverImageId);
            console.log(`[Cover Summary] Books with covers: ${booksWithCovers.length}/${books.length}`);
            console.log(`[Cover Summary] Books with covers:`, booksWithCovers.map(b => b.title));
            console.log(`[Cover Summary] Books without covers:`, booksWithoutCovers.map(b => b.title));
            
            // Cache the book list to prevent redundant API calls
            bookCacheService.setBookListCache(books);
            
            // Don't wait for cover downloads - return books immediately
            // Covers will be updated via the callback as they become available
            return books;
            
        } catch (error) {
            console.error('Error fetching books from Google Drive:', error);
            // Return empty array on error rather than throwing
            return [];
        }
    }

    async deleteBook(id: string): Promise<void> {
        console.log('deleteBook: Deleting book from user\'s Google Drive. Book ID:', id);
        
        try {
            // Check if user is signed in to Google Drive
            if (!gDriveService.isSignedIn()) {
                throw new Error('User not signed in to Google Drive');
            }

            // Get metadata to find cover image ID before deleting
            const metadataInfo = await gDriveService.getMetadataFile();
            let coverImageId: string | undefined;

            if (metadataInfo && metadataInfo.data.covers) {
                coverImageId = metadataInfo.data.covers[id];
            }

            // Delete the book file from Google Drive
            const bookDeleteSuccess = await gDriveService.deleteFile(id);
            
            if (!bookDeleteSuccess) {
                throw new Error('Failed to delete book file from Google Drive');
            }

            console.log('✅ Book file deleted from Google Drive successfully');

            // Delete cover image if it exists
            if (coverImageId) {
                const coverDeleteSuccess = await gDriveService.deleteFile(coverImageId);
                if (coverDeleteSuccess) {
                    console.log('✅ Cover image deleted from Google Drive successfully');
                } else {
                    console.warn('⚠️ Failed to delete cover image, but book deletion succeeded');
                }
            }

            // Remove from metadata.json
            const metadataUpdateSuccess = await gDriveService.removeBookMetadata(id);
            if (!metadataUpdateSuccess) {
                console.warn('⚠️ Failed to update metadata file, but book deletion succeeded');
            } else {
                console.log('✅ Book metadata removed successfully');
            }

            // Clear cache since book list has changed
            bookCacheService.clearBookListCache();
            
        } catch (error) {
            console.error('Error deleting book from Google Drive:', error);
            throw error;
        }
    }

    /**
     * Update the cover image for a book
     * Uploads new cover to cloud storage and updates metadata
     */
    async updateBookCover(bookId: string, coverFile: File): Promise<string> {
        console.log('updateBookCover: Updating cover for book:', bookId);
        
        try {
            // Check if user is signed in to Google Drive
            if (!gDriveService.isSignedIn()) {
                throw new Error('User not signed in to Google Drive');
            }

            // Get current metadata to find existing cover and book data
            const metadataInfo = await gDriveService.getMetadataFile();
            let currentCoverImageId: string | undefined;
            let existingBookData: any;

            if (metadataInfo && metadataInfo.data.books && metadataInfo.data.books[bookId]) {
                existingBookData = metadataInfo.data.books[bookId];
                currentCoverImageId = metadataInfo.data.covers ? metadataInfo.data.covers[bookId] : undefined;
            }

            if (!existingBookData) {
                throw new Error('Book not found in metadata');
            }

            if (!metadataInfo) {
                throw new Error('Could not access metadata file');
            }

            // Upload new cover image to Google Drive using correct signature
            const fileName = `${bookId}-cover-${Date.now()}.${coverFile.name.split('.').pop()}`;
            const coverResult = await gDriveService.uploadFile(fileName, coverFile, coverFile.type);
            if (!coverResult || !coverResult.id) {
                throw new Error('Failed to upload new cover image to Google Drive');
            }

            const coverImageId = coverResult.id;
            console.log('✅ New cover image uploaded to Google Drive:', coverImageId);

            // Update metadata by getting the current data and modifying only the coverImageId
            const { fileId, data } = metadataInfo;
            data.books[bookId] = {
                ...existingBookData
            };
            data.covers = data.covers || {};
            data.covers[bookId] = coverImageId;

            const metadataUpdateSuccess = await gDriveService.updateMetadataFile(fileId, data);

            if (!metadataUpdateSuccess) {
                // If metadata update fails, try to clean up the uploaded cover
                await gDriveService.deleteFile(coverImageId);
                throw new Error('Failed to update book metadata with new cover');
            }

            console.log('✅ Book metadata updated with new cover');

            // Purge cached cover for this book so UI fetches the new one
            await removeCoverForFile(bookId);
            if (currentCoverImageId && currentCoverImageId !== coverImageId) {
                await removeCachedCover(currentCoverImageId);
            }

            // Clear the cover URL cache for this book to force re-download
            bookCacheService.clearCoverUrlCache(bookId);

            // Clear book list cache since cover has changed
            bookCacheService.clearBookListCache();

            // Delete old cover image if it exists (do this after successful update)
            if (currentCoverImageId && currentCoverImageId !== coverImageId) {
                const deleteSuccess = await gDriveService.deleteFile(currentCoverImageId);
                if (deleteSuccess) {
                    console.log('✅ Old cover image deleted from Google Drive');
                } else {
                    console.warn('⚠️ Failed to delete old cover image, but new cover was set successfully');
                }
            }

            return coverImageId;
            
        } catch (error) {
            console.error('Error updating book cover:', error);
            throw error;
        }
    }

    /**
     * Update book metadata (title, author, etc.)
     */
    async updateBookMetadata(bookId: string, updates: { title?: string; author?: string }): Promise<void> {
        console.log('updateBookMetadata: Updating metadata for book:', bookId, updates);
        
        try {
            // Check if user is signed in to Google Drive
            if (!gDriveService.isSignedIn()) {
                throw new Error('User not signed in to Google Drive');
            }

            // Get current metadata
            const metadataInfo = await gDriveService.getMetadataFile();
            if (!metadataInfo) {
                throw new Error('Could not access metadata file');
            }

            const { fileId, data } = metadataInfo;
            const existingBookData = data.books?.[bookId];

            if (!existingBookData) {
                throw new Error('Book not found in metadata');
            }

            // Update the book data with new values
            data.books[bookId] = {
                ...existingBookData,
                ...(updates.title && { title: updates.title }),
                ...(updates.author && { author: updates.author }),
            };

            // Save updated metadata
            const metadataUpdateSuccess = await gDriveService.updateMetadataFile(fileId, data);

            if (!metadataUpdateSuccess) {
                throw new Error('Failed to update book metadata');
            }

            console.log('✅ Book metadata updated successfully');

            // Clear book list cache since metadata has changed
            bookCacheService.clearBookListCache();
        } catch (error) {
            console.error('Error updating book metadata:', error);
            throw error;
        }
    }

    /**
     * Sync the user's books with their connected cloud provider.
     * Currently implemented for Google Drive only.
     */
    async syncBooks(clerkUser?: any, onCoverReady?: (bookId: string, coverUrl: string) => void): Promise<BookMetadata[]> {
        console.log('Syncing books with cloud storage...');

        // CRITICAL: Check Clerk authentication first
        if (!clerkUser) {
            console.log('syncBooks: No Clerk user provided, skipping sync');
            return [];
        }

        const provider = this.detectProviderFromClerkUser(clerkUser);

        switch (provider) {
            case 'google':
                const isAuthenticated = await authManager.ensureAuthenticated();
                if (!isAuthenticated) {
                    throw new Error('Google Drive authentication failed. Please connect first.');
                }
                await gDriveService.syncMetadataWithDrive();
                return await this.getUserBooks(onCoverReady);

            case 'microsoft':
                // TODO: Implement OneDrive sync
                throw new Error('OneDrive sync not yet implemented');

            case 'apple':
                // TODO: Implement iCloud sync
                throw new Error('iCloud sync not yet implemented');

            default:
                throw new Error(`Cannot sync books for provider: ${provider}. Cloud storage not configured.`);
        }
    }

    /**
     * Open the cloud storage folder where books are stored
     * This method will work with different cloud providers (Google Drive, OneDrive, iCloud)
     */
    async openCloudFolder(clerkUser?: any): Promise<void> {
        console.log('Opening cloud storage folder...');
        
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                if (!gDriveService.isSignedIn()) {
                    throw new Error('Google Drive not connected. Please connect first.');
                }
                await gDriveService.openFolder();
                break;
                
            case 'microsoft':
                // TODO: Implement OneDrive folder opening
                throw new Error('OneDrive folder opening not yet implemented');
                
            case 'apple':
                // TODO: Implement iCloud folder opening  
                throw new Error('iCloud folder opening not yet implemented');
                
            default:
                throw new Error(`Cannot open folder for provider: ${provider}. Cloud storage not configured.`);
        }
    }

    /**
     * Save user settings to Google Drive settings.json file
     */
    async saveSettings(settings: any): Promise<boolean> {
        console.log('Saving settings to Google Drive settings.json...');

        try {
            if (!gDriveService.isSignedIn()) {
                console.warn('Cannot save settings: Google Drive not connected');
                return false;
            }

            const success = await gDriveService.saveSettings(settings);
            if (success) {
                console.log('✅ Settings saved to Google Drive successfully');
                return true;
            } else {
                console.warn('⚠️ Failed to save settings to Google Drive');
                return false;
            }
        } catch (error) {
            console.error('Error saving settings to Google Drive:', error);
            return false;
        }
    }

    /**
     * Load user settings from Google Drive settings.json file
     */
    async loadSettings(): Promise<any | null> {
        console.log('Loading settings from Google Drive settings.json...');

        try {
            // CRITICAL: Check Clerk authentication first
            if (typeof window !== 'undefined' && window.Clerk) {
                const clerkUser = window.Clerk.user;
                const isClerkSignedIn = window.Clerk.session !== null;
                
                if (!clerkUser || !isClerkSignedIn) {
                    console.log('loadSettings: Clerk user not authenticated, skipping Google Drive access');
                    return null;
                }
            } else {
                console.log('loadSettings: Clerk not available, skipping Google Drive access');
                return null;
            }

            const isAuthenticated = await authManager.ensureAuthenticated();
            if (!isAuthenticated) {
                console.warn('Cannot load settings: Google Drive authentication failed');
                return null;
            }

            const settings = await gDriveService.loadSettings();
            if (settings) {
                console.log('✅ Settings loaded from Google Drive successfully');
                return settings;
            } else {
                console.log('ℹ️ No settings found in Google Drive');
                return null;
            }
        } catch (error) {
            console.error('Error loading settings from Google Drive:', error);
            return null;
        }
    }

    /**
     * Save vocabulary list to cloud storage
     */
    async saveVocabulary(words: any[]): Promise<void> {
        // Use centralized auth manager to ensure authentication
        const isAuthenticated = await authManager.ensureAuthenticated();
        if (!isAuthenticated) {
            console.log('saveVocabulary: Authentication failed, cannot save vocabulary');
            return;
        }

        await gDriveService.saveVocab(words);
    }

    /**
     * Load vocabulary list from cloud storage
     */
    async loadVocabulary(): Promise<any[] | null> {
        // Use centralized auth manager to ensure authentication
        const isAuthenticated = await authManager.ensureAuthenticated();
        if (!isAuthenticated) {
            console.log('loadVocabulary: Authentication failed, cannot load vocabulary');
            return null;
        }

        return await gDriveService.loadVocab();
    }

    // Folder management methods
    async createFolder(name: string, parentId?: string, clerkUser?: any): Promise<Folder> {
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                return await gDriveService.createFolder(name, parentId);
            case 'microsoft':
                throw new Error('OneDrive folder creation not yet implemented');
            case 'apple':
                throw new Error('iCloud folder creation not yet implemented');
            default:
                throw new Error('No cloud provider configured for folder creation');
        }
    }

    async updateFolder(folderId: string, updates: { name?: string; parentId?: string }, clerkUser?: any): Promise<Folder> {
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                return await gDriveService.updateFolder(folderId, updates);
            case 'microsoft':
                throw new Error('OneDrive folder update not yet implemented');
            case 'apple':
                throw new Error('iCloud folder update not yet implemented');
            default:
                throw new Error('No cloud provider configured for folder update');
        }
    }

    async deleteFolder(folderId: string, clerkUser?: any): Promise<void> {
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                await gDriveService.deleteFolder(folderId);
                break;
            case 'microsoft':
                throw new Error('OneDrive folder deletion not yet implemented');
            case 'apple':
                throw new Error('iCloud folder deletion not yet implemented');
            default:
                throw new Error('No cloud provider configured for folder deletion');
        }
    }

    async getFolders(clerkUser?: any): Promise<Folder[]> {
        console.log('📁 [StorageService] getFolders called with clerkUser:', !!clerkUser);
        
        // CRITICAL: Check Clerk authentication first
        if (!clerkUser) {
            console.log('📁 [StorageService] getFolders: No Clerk user provided, returning empty folders');
            return [];
        }

        const provider = this.detectProviderFromClerkUser(clerkUser);
        console.log('📁 [StorageService] Detected provider:', provider);
        
        switch (provider) {
            case 'google':
                console.log('📁 [StorageService] Calling gDriveService.getFolders()...');
                const folders = await gDriveService.getFolders();
                console.log('📁 [StorageService] gDriveService.getFolders() returned:', folders.length, 'folders');
                return folders;
            case 'microsoft':
                throw new Error('OneDrive folder retrieval not yet implemented');
            case 'apple':
                throw new Error('iCloud folder retrieval not yet implemented');
            default:
                console.log('📁 [StorageService] Unknown provider, returning empty folders');
                return [];
        }
    }

    async moveBookToFolder(bookId: string, folderId: string | null, clerkUser?: any): Promise<void> {
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                await gDriveService.moveBookToFolder(bookId, folderId);
                break;
            case 'microsoft':
                throw new Error('OneDrive book moving not yet implemented');
            case 'apple':
                throw new Error('iCloud book moving not yet implemented');
            default:
                throw new Error('No cloud provider configured for book moving');
        }
    }
}

export const bookMetadataService = new BookMetadataService();


import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';
import { gDriveService } from './gdriveService';

// Declare the existing driveSync functions for TypeScript
declare global {
    interface Window {
        Clerk: any;
        JSZip?: any;
        ePub?: (buffer: ArrayBuffer, options?: any) => {
            ready: Promise<void>;
            spine?: {
                spineItems?: any[];
            };
            coverUrl(): Promise<string | null>;
            archive: {
                request(path: string, type: 'blob'): Promise<Blob>;
            };
        };
    }
}

// Request deduplication cache to prevent multiple simultaneous requests for the same resource
const activeDownloads = new Map<string, Promise<Blob>>();

export interface BookMetadata {
    id: string;
    title: string;
    fileType: string;
    // Cloud storage pointers - NO CONTENT
    driveFileId?: string;
    onedriveFileId?: string;
    icloudFileId?: string;
    coverImageId?: string;
    coverUrl?: string;
    totalChapters?: number;
    uploadedAt: Date;
    // Metadata only
    userId: string;
    cloudProvider: 'google' | 'onedrive' | 'icloud' | 'local';
}

export interface ReadingProgress {
    bookId: string;
    userId: string;
    currentChapter: number;
    currentPosition: number;
    lastUpdated: Date;
}

type Provider = 'google' | 'apple' | 'microsoft' | 'email';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

initializeApp(firebaseConfig);

class StorageService {
    private db = getFirestore();

    private async getAuthHeaders(): Promise<HeadersInit> {
        // Get Clerk session token for API calls
        if (typeof window !== 'undefined' && window.Clerk) {
            try {
                const token = await window.Clerk.session?.getToken();
                if (token) {
                    return {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    };
                }
            } catch (error) {
                console.error('Error getting Clerk token:', error);
            }
        }
        return {
            'Content-Type': 'application/json'
        };
    }

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
    async uploadBook(file: File, meta: {title: string; fileType: string; cover?: Blob}, clerkUser?: any): Promise<BookMetadata> {
        console.log('Uploading book to user\'s cloud storage. Privacy-first: no content stored in our backend.');
        
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                try {
                    // Check connection
                    if (!gDriveService.isSignedIn()) {
                        console.log('Google Drive not connected. Attempting to connect...');
                        await new Promise<void>((resolve, reject) => {
                            const checkSignedIn = () => {
                                if (gDriveService.isSignedIn()) {
                                    console.log('✅ Google Drive connected successfully');
                                    resolve();
                                } else {
                                    setTimeout(checkSignedIn, 1000);
                                }
                            };
                            gDriveService.signIn().then(() => {
                                checkSignedIn();
                            }).catch(reject);
                        });
                    }

                    // Extract cover image from EPUB if file type is epub and no cover provided
                    let coverBlob = meta.cover;
                    
                    if (!coverBlob && meta.fileType === 'epub') {
                        console.log('Attempting to extract cover from EPUB file...');
                        try {
                            const extractedCover = await this.extractCoverFromEpub(file);
                            if (extractedCover) {
                                coverBlob = extractedCover;
                                console.log('✅ Cover extracted from EPUB successfully');
                            } else {
                                console.log('📖 No cover found in EPUB file');
                            }
                        } catch (error) {
                            console.warn('⚠️ Failed to extract cover from EPUB:', error);
                        }
                    }

                    // Upload the book file
                    const bookResult = await gDriveService.uploadFile(
                        file.name,
                        file,
                        file.type || 'application/epub+zip'
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
                        fileName: file.name,
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
                        cloudProvider: 'google'
                    };

                    console.log('✅ Book uploaded to user\'s cloud storage successfully. Privacy-first: no metadata stored in our backend.');
                    
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

    /**
     * Extract cover image from EPUB file using epub.js
     * Based on the original JavaScript implementation
     */
    private async extractCoverFromEpub(file: File): Promise<Blob | null> {
        try {
            // Load epub.js dynamically if not already loaded
            if (!(window as any).ePub) {
                await this.loadEpubJs();
            }

            const ePub = (window as any).ePub;
            if (!ePub) {
                throw new Error('epub.js library failed to load');
            }

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            
            // Create EPUB book instance
            const book = ePub(arrayBuffer, { replacements: 'blobUrl' });
            await book.ready;

            // Check if the book has a spine (valid EPUB)
            if (!book.spine?.spineItems?.length) {
                throw new Error('Invalid EPUB file - empty spine');
            }

            // Get cover URL from the book
            const coverUrl = await book.coverUrl();
            if (!coverUrl) {
                console.log('No cover URL found in EPUB metadata');
                return null;
            }

            // Fetch the cover image
            let coverBlob: Blob;
            if (coverUrl.startsWith('blob:')) {
                // It's already a blob URL, fetch it directly
                const response = await fetch(coverUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch cover: ${response.status} ${response.statusText}`);
                }
                coverBlob = await response.blob();
            } else {
                // Use the book's archive to request the cover
                coverBlob = await book.archive.request(coverUrl, 'blob');
            }

            return coverBlob;

        } catch (error) {
            console.error('Error extracting cover from EPUB:', error);
            return null;
        }
    }

    /**
     * Dynamically load epub.js library and its dependencies
     */
    private async loadEpubJs(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Check if both libraries are already loaded
            if ((window as any).ePub && (window as any).JSZip) {
                resolve();
                return;
            }

            // Load dependencies in sequence: JSZip first, then epub.js
            this.loadDependenciesSequentially()
                .then(() => resolve())
                .catch(reject);
        });
    }

    /**
     * Load JSZip and epub.js in the correct order
     */
    private async loadDependenciesSequentially(): Promise<void> {
        // First load JSZip if not already loaded
        if (!(window as any).JSZip) {
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
            if (!(window as any).JSZip) {
                throw new Error('JSZip failed to load');
            }
        }

        // Then load epub.js if not already loaded
        if (!(window as any).ePub) {
            await this.loadScript('https://unpkg.com/epubjs@0.3.93/dist/epub.min.js');
            if (!(window as any).ePub) {
                throw new Error('epub.js failed to load');
            }
        }
    }

    /**
     * Load a single script and return a promise
     */
    private async loadScript(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Check if script is already present
            if (document.querySelector(`script[src="${url}"]`)) {
                // Wait for it to finish loading
                const checkLoaded = () => {
                    const isJSZip = url.includes('jszip');
                    const isEpub = url.includes('epub');
                    
                    if ((isJSZip && (window as any).JSZip) || 
                        (isEpub && (window as any).ePub) ||
                        (!isJSZip && !isEpub)) {
                        resolve();
                    } else {
                        setTimeout(checkLoaded, 100);
                    }
                };
                checkLoaded();
                return;
            }

            // Create and load the script
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            
            script.onload = () => {
                resolve();
            };
            
            script.onerror = () => {
                document.head.removeChild(script);
                reject(new Error(`Failed to load script: ${url}`));
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * Download a book's file content from cloud storage
     */
    async downloadBook(bookId: string, metadata: BookMetadata): Promise<Blob> {
        console.log('Downloading book from user\'s google cloud storage');
        
        // Check if this book is already being downloaded
        if (activeDownloads.has(bookId)) {
            console.log('Book download already in progress, waiting for existing request...');
            return activeDownloads.get(bookId)!;
        }
        
        const downloadPromise = (async () => {
            try {
                if (!gDriveService.isSignedIn()) {
                    throw new Error('Not signed in to Google Drive');
                }
                
                if (!metadata.driveFileId) {
                    throw new Error('Google Drive file ID not found for this book.');
                }
                
                const blob = await gDriveService.downloadFile(metadata.driveFileId);
                if (!blob) {
                    throw new Error('Failed to download file from Google Drive, or file was empty.');
                }
                return blob;
            } catch (error: any) {
                console.error('Google Drive download failed:', error);
                throw new Error(`Failed to download from Google Drive: ${error.message || 'Unknown error'}`);
            } finally {
                // Remove from active downloads when complete
                activeDownloads.delete(bookId);
            }
        })();
        
        // Store the promise to prevent duplicate requests
        activeDownloads.set(bookId, downloadPromise);
        
        return downloadPromise;
    }

    async getUserBooks(onCoverReady?: (bookId: string, coverUrl: string) => void): Promise<BookMetadata[]> {
        console.log('getUserBooks: Fetching book list from user\'s Google Drive...');
        
        try {
            // Check if user is signed in to Google Drive
            if (!gDriveService.isSignedIn()) {
                console.log('User not signed in to Google Drive');
                return [];
            }

            // Get metadata.json file which contains book-to-cover mappings
            const metadataInfo = await gDriveService.getMetadataFile();
            if (!metadataInfo) {
                console.log('No metadata file found, returning empty list');
                return [];
            }

            const { data: metadata } = metadataInfo;
            const bookEntries = metadata.books || {};

            console.log('Found book entries in metadata:', Object.keys(bookEntries).length);

            // Get list of files from user's Google Drive app folder to verify they still exist
            const driveFiles = await gDriveService.listFiles();
            const driveFileIds = new Set(driveFiles.map(file => file.id));

            // Convert book entries to BookMetadata, filtering out deleted files
            const books: BookMetadata[] = [];
            const coverDownloadTasks: Promise<void>[] = [];
            
            for (const [bookFileId, bookData] of Object.entries(bookEntries)) {
                // Skip if the book file no longer exists in Drive
                if (!driveFileIds.has(bookFileId)) {
                    console.log(`Book file ${bookFileId} no longer exists in Drive, skipping`);
                    continue;
                }

                // Get the actual file info from Drive for additional details
                const driveFile = driveFiles.find(file => file.id === bookFileId);
                if (!driveFile) continue;

                const bookMetadata = bookData as any;
                
                // Create book metadata immediately without cover
                const book: BookMetadata = {
                    id: bookFileId,
                    title: bookMetadata.title || driveFile.name.replace(/\.[^/.]+$/, ''), // fallback to filename without extension
                    fileType: bookMetadata.fileType || driveFile.name.split('.').pop()?.toLowerCase() || 'unknown',
                    driveFileId: bookFileId,
                    coverImageId: bookMetadata.coverImageId,
                    coverUrl: undefined, // Will be set asynchronously
                    uploadedAt: bookMetadata.uploadedAt ? new Date(bookMetadata.uploadedAt) : new Date(driveFile.modifiedTime || Date.now()),
                    userId: 'current-user', // We don't store user ID since we're privacy-first
                    cloudProvider: 'google' as const
                };

                books.push(book);

                // Start async cover download if cover exists
                if (bookMetadata.coverImageId && driveFileIds.has(bookMetadata.coverImageId) && onCoverReady) {
                    const coverTask = this.downloadCoverAsync(bookFileId, bookMetadata.coverImageId, bookMetadata.title, onCoverReady);
                    coverDownloadTasks.push(coverTask);
                }
            }

            console.log(`Processed ${books.length} books from metadata (covers downloading in background)`);
            
            // Don't wait for cover downloads - return books immediately
            // Covers will be updated via the callback as they become available
            return books;
            
        } catch (error) {
            console.error('Error fetching books from Google Drive:', error);
            // Return empty array on error rather than throwing
            return [];
        }
    }

    /**
     * Download a single cover image asynchronously
     */
    private async downloadCoverAsync(
        bookId: string, 
        coverImageId: string, 
        bookTitle: string, 
        onCoverReady: (bookId: string, coverUrl: string) => void
    ): Promise<void> {
        try {
            console.log(`[Async] Downloading cover image for book: ${bookTitle}`);
            const coverBlob = await gDriveService.downloadFile(coverImageId);
            
            if (coverBlob) {
                // Debug: Log blob details
                console.log(`[Async] Cover blob details - Size: ${coverBlob.size}, Type: ${coverBlob.type}`);
                
                // Test if the blob is a valid image
                const isValidImage = await this.testBlobImage(coverBlob);
                
                // Validate that we have a valid image blob
                if (coverBlob.size > 0 && isValidImage) {
                    // Create a blob URL for the cover image
                    const coverUrl = URL.createObjectURL(coverBlob);
                    console.log(`✅ [Async] Cover image ready for: ${bookTitle}`);
                    
                    // Notify the UI that the cover is ready
                    onCoverReady(bookId, coverUrl);
                } else {
                    console.warn(`⚠️ [Async] Invalid cover image blob for ${bookTitle} - Size: ${coverBlob.size}, Type: ${coverBlob.type}, Valid: ${isValidImage}`);
                }
            } else {
                console.warn(`⚠️ [Async] No blob returned for cover image of ${bookTitle}`);
            }
        } catch (error) {
            console.warn(`⚠️ [Async] Failed to download cover for book ${bookTitle}:`, error);
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
            
            if (metadataInfo && metadataInfo.data.books && metadataInfo.data.books[id]) {
                coverImageId = metadataInfo.data.books[id].coverImageId;
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
                currentCoverImageId = existingBookData.coverImageId;
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
                ...existingBookData,
                coverImageId: coverImageId
            };

            const metadataUpdateSuccess = await gDriveService.updateMetadataFile(fileId, data);

            if (!metadataUpdateSuccess) {
                // If metadata update fails, try to clean up the uploaded cover
                await gDriveService.deleteFile(coverImageId);
                throw new Error('Failed to update book metadata with new cover');
            }

            console.log('✅ Book metadata updated with new cover');

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

    async getReadingProgress(bookId: string): Promise<ReadingProgress | null> {
        console.log('Getting reading progress for book:', bookId);
        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch(`/api/progress/${bookId}`, {
                method: 'GET',
                headers
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null; // No progress found
                }
                throw new Error(`Failed to fetch progress: ${response.status} ${response.statusText}`);
            }

            const progress = await response.json();
            if (!progress) return null;

            return {
                ...progress,
                lastUpdated: new Date(progress.lastUpdated)
            };
        } catch (error) {
            console.error('Error fetching reading progress:', error);
            throw error;
        }
    }

    async saveReadingProgress(progress: ReadingProgress): Promise<void> {
        console.log('Saving reading progress:', progress);
        try {
            const headers = await this.getAuthHeaders();
            const response = await fetch('/api/progress', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    bookId: progress.bookId,
                    currentChapter: progress.currentChapter,
                    currentPosition: progress.currentPosition
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to save progress: ${response.status} ${response.statusText}`);
            }

            console.log('Reading progress saved successfully');
        } catch (error) {
            console.error('Error saving reading progress:', error);
            throw error;
        }
    }

    // Legacy methods for compatibility - these now do nothing since we use Clerk
    getCurrentUser(): null {
        console.log('getCurrentUser() is deprecated - use Clerk user instead');
        return null;
    }

    onAuthStateChange(callback: (user: null) => void): () => void {
        console.log('onAuthStateChange() is deprecated - use Clerk\'s useUser hook instead');
        callback(null);
        return () => {}; // Return empty unsubscribe function
    }

    async ensureUserDocument(): Promise<void> {
        console.log('ensureUserDocument() is deprecated - backend handles user creation');
    }

    /**
     * Clean up blob URLs to prevent memory leaks
     * Call this when book list is refreshed or component unmounts
     */
    cleanupBlobUrls(books: BookMetadata[]): void {
        books.forEach(book => {
            if (book.coverUrl && book.coverUrl.startsWith('blob:')) {
                URL.revokeObjectURL(book.coverUrl);
            }
        });
    }

    /**
     * Test if a blob contains valid image data
     * This creates a temporary image element to validate the blob
     */
    private async testBlobImage(blob: Blob): Promise<boolean> {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                console.log(`✅ Blob is valid image: ${img.width}x${img.height}`);
                resolve(true);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                console.warn('❌ Blob is not a valid image');
                resolve(false);
            };
            
            // Set a timeout to avoid hanging
            setTimeout(() => {
                URL.revokeObjectURL(url);
                console.warn('⏰ Image validation timeout');
                resolve(false);
            }, 5000);
            
            img.src = url;
        });
    }

    /**
     * Save user settings to cloud storage
     * Uses the same provider detection as openCloudFolder for consistency
     */
    async saveSettings(settings: any, clerkUser?: any): Promise<void> {
        console.log('Saving settings to user\'s cloud storage...');
        
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                if (!gDriveService.isSignedIn()) {
                    throw new Error('Google Drive not connected. Please connect first.');
                }
                
                try {
                    const success = await gDriveService.saveSettings(settings);
                    if (!success) {
                        throw new Error('Failed to save settings to Google Drive');
                    }
                    console.log('✅ Settings saved to Google Drive successfully');
                } catch (error: any) {
                    console.error('Google Drive settings save failed:', error);
                    throw new Error(`Failed to save settings to Google Drive: ${error.message || 'Unknown error'}`);
                }
                break;
                
            case 'microsoft':
                // TODO: Implement OneDrive settings save
                throw new Error('OneDrive settings save not yet implemented');
                
            case 'apple':
                // TODO: Implement iCloud settings save
                throw new Error('iCloud settings save not yet implemented');
                
            default:
                throw new Error(`Cannot save settings for provider: ${provider}. Cloud storage not configured.`);
        }
    }

    /**
     * Load user settings from cloud storage
     * Returns null if no settings found or user not connected
     */
    async loadSettings(clerkUser?: any): Promise<any | null> {
        console.log('Loading settings from user\'s cloud storage...');
        
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                if (!gDriveService.isSignedIn()) {
                    console.log('Google Drive not connected, cannot load settings');
                    return null;
                }
                
                try {
                    const settings = await gDriveService.loadSettings();
                    if (settings) {
                        console.log('✅ Settings loaded from Google Drive successfully');
                        return settings;
                    } else {
                        console.log('📋 No settings file found in Google Drive');
                        return null;
                    }
                } catch (error: any) {
                    console.error('Google Drive settings load failed:', error);
                    // Don't throw error, just return null for missing settings
                    return null;
                }
                
            case 'microsoft':
                // TODO: Implement OneDrive settings load
                console.log('OneDrive settings load not yet implemented');
                return null;
                
            case 'apple':
                // TODO: Implement iCloud settings load
                console.log('iCloud settings load not yet implemented');
                return null;
                
            default:
                console.log(`Cannot load settings for provider: ${provider}. Using local defaults.`);
                return null;
        }
    }
}

export const storageService = new StorageService();

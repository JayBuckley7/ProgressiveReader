
import { gDriveService, BOOK_FILE_EXTENSIONS } from './gdriveService';
import {
    getCachedFile,
    cacheFile,
    getCachedCover,
    cacheCover,
    getCoverForFile,
    cacheCoverForFile,
    removeCachedCover,
    removeCoverForFile
} from './driveCache';


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
    // Folder organization
    folderId?: string;
}

export interface Folder {
    id: string;
    name: string;
    parentId?: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
}

export interface LibraryStructure {
    folders: Folder[];
    books: BookMetadata[];
}

export interface ReadingProgress {
    bookId: string;
    userId: string;
    currentChapter: number;
    currentPosition: number;
    currentPage?: number; // For PDF files
    totalPages?: number; // For PDFs
    lastUpdated: Date;
    fileType?: string; // Track whether it's pdf, epub, etc.
}

type Provider = 'google' | 'apple' | 'microsoft' | 'email';

class StorageService {
    // Cache for book metadata to prevent redundant API calls - increased duration
    private bookListCache: { data: BookMetadata[], timestamp: number } | null = null;
    private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes instead of 5

    // Cache for blob URLs to prevent recreating them
    private coverUrlCache = new Map<string, string>();
    
    // Track active cover downloads to prevent duplicates
    private activeCoverDownloads = new Map<string, Promise<string | null>>();

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
                    } else if (!coverBlob && meta.fileType === 'pdf') {
                        const extracted = await this.extractCoverFromPdf(file);
                        if (extracted) coverBlob = extracted;
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
                        cloudProvider: 'google',
                        folderId: undefined // New books start without a folder
                    };

                                console.log('✅ Book uploaded to user\'s cloud storage successfully. Privacy-first: no metadata stored in our backend.');
            
            // Clear cache since book list has changed
            this.clearBookListCache();
            
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
     * Extract cover image from a PDF file using pdf.js
     */
    private async extractCoverFromPdf(file: File): Promise<Blob | null> {
        try {
            await this.loadPdfJs();
            const pdfjsLib = (window as any).pdfjsLib;
            if (!pdfjsLib) {
                throw new Error('pdf.js library failed to load');
            }

            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            if (pdf.numPages < 1) {
                return null;
            }
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: context, viewport }).promise;

            return await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg');
            });
        } catch (error) {
            console.error('Error extracting cover from PDF:', error);
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
     * Dynamically load pdf.js library
     */
    private async loadPdfJs(): Promise<void> {
        if ((window as any).pdfjsLib) {
            return;
        }
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
            throw new Error('pdf.js failed to load');
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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

                // Check IndexedDB cache first
                const cached = await getCachedFile(metadata.driveFileId);
                if (cached) {
                    console.log('Retrieved book from cache');
                    return cached;
                }

                const blob = await gDriveService.downloadFile(metadata.driveFileId);
                if (!blob) {
                    throw new Error('Failed to download file from Google Drive, or file was empty.');
                }

                // Store in cache for future use
                await cacheFile(metadata.driveFileId, blob);

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

            // Check cache first to prevent redundant API calls
            const now = Date.now();
            if (this.bookListCache && (now - this.bookListCache.timestamp < this.CACHE_DURATION)) {
                console.log('getUserBooks: Using cached book list to prevent redundant API calls');
                
                // Update books with current cached cover URLs and trigger callbacks
                const updatedBooks = this.bookListCache.data.map(book => {
                    const cachedCoverUrl = this.getCachedCoverUrl(book.id);
                    const updatedBook = cachedCoverUrl ? { ...book, coverUrl: cachedCoverUrl } : book;
                    
                    // Trigger callback for books with covers
                    if (onCoverReady && updatedBook.coverUrl) {
                        onCoverReady(book.id, updatedBook.coverUrl);
                    } else if (onCoverReady && !updatedBook.coverUrl && book.coverImageId) {
                        // Start async download for books without cached covers
                        this.downloadCoverAsync(book.id, book.coverImageId, book.title, onCoverReady);
                    }
                    
                    return updatedBook;
                });
                
                // Update the cache with current cover URLs
                this.bookListCache.data = updatedBooks;
                
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
                const cachedCoverUrl = this.getCachedCoverUrl(bookFileId);
                const book: BookMetadata = {
                    id: bookFileId,
                    title: bookMetadata.title || driveFile.name.replace(/\.[^/.]+$/, ''), // fallback to filename without extension
                    fileType: bookMetadata.fileType || driveFile.name.split('.').pop()?.toLowerCase() || 'unknown',
                    driveFileId: bookFileId,
                    coverImageId: coverImageId,
                    coverUrl: cachedCoverUrl, // Use cached URL if available
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
                        const coverTask = this.downloadCoverAsync(bookFileId, coverImageId, bookMetadata.title, onCoverReady);
                        coverDownloadTasks.push(coverTask);
                    } else {
                        console.log(`[Cover Debug] Using cached cover for book: ${bookMetadata.title}`);
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
            this.bookListCache = {
                data: books,
                timestamp: Date.now()
            };
            
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
     * Get or create a persistent cover URL for a book
     * This method checks cache first and reuses blob URLs when possible
     */
    private async getPersistentCoverUrl(bookId: string, coverImageId: string): Promise<string | null> {
        // Check if we already have a cached URL for this book
        const cachedUrl = this.coverUrlCache.get(bookId);
        if (cachedUrl) {
            // Verify the URL is still valid by trying to create an image
            try {
                const isValid = await this.testBlobUrl(cachedUrl);
                if (isValid) {
                    console.log(`[Cover Cache] Using cached URL for book ${bookId}`);
                    return cachedUrl;
                } else {
                    // URL is invalid, remove from cache
                    this.coverUrlCache.delete(bookId);
                    URL.revokeObjectURL(cachedUrl);
                }
            } catch {
                // URL test failed, remove from cache
                this.coverUrlCache.delete(bookId);
                URL.revokeObjectURL(cachedUrl);
            }
        }

        // Check if download is already in progress
        if (this.activeCoverDownloads.has(bookId)) {
            console.log(`[Cover Cache] Download in progress for book ${bookId}, waiting...`);
            return this.activeCoverDownloads.get(bookId)!;
        }

        // Start new download
        const downloadPromise = this.downloadAndCacheCover(bookId, coverImageId);
        this.activeCoverDownloads.set(bookId, downloadPromise);
        
        try {
            const result = await downloadPromise;
            return result;
        } finally {
            this.activeCoverDownloads.delete(bookId);
        }
    }

    /**
     * Download and cache a cover, returning a persistent blob URL
     */
    private async downloadAndCacheCover(bookId: string, coverImageId: string): Promise<string | null> {
        try {
            // Check file-level cache first
            let coverBlob = await getCoverForFile(bookId);
            if (coverBlob) {
                console.log(`[Cover Cache] Found cover in file cache for book ${bookId}`);
            } else {
                // Check cover-level cache
                coverBlob = await getCachedCover(coverImageId);
                if (coverBlob) {
                    console.log(`[Cover Cache] Found cover in cover cache for book ${bookId}`);
                    await cacheCoverForFile(bookId, coverBlob);
                } else {
                    // Download from Google Drive
                    console.log(`[Cover Cache] Downloading cover from Google Drive for book ${bookId}`);
                    coverBlob = await gDriveService.downloadFile(coverImageId);
                    if (coverBlob) {
                        await cacheCover(coverImageId, coverBlob);
                        await cacheCoverForFile(bookId, coverBlob);
                        console.log(`[Cover Cache] Downloaded and cached cover for book ${bookId}`);
                    }
                }
            }
            
            if (coverBlob && coverBlob.size > 0) {
                // Validate the image
                const isValidImage = await this.testBlobImage(coverBlob);
                if (isValidImage) {
                    // Create persistent blob URL
                    const coverUrl = URL.createObjectURL(coverBlob);
                    this.coverUrlCache.set(bookId, coverUrl);
                    console.log(`✅ [Cover Cache] Created persistent URL for book ${bookId}`);
                    return coverUrl;
                } else {
                    console.warn(`⚠️ [Cover Cache] Invalid image blob for book ${bookId}`);

                }
            }
            
            return null;
        } catch (error) {
            console.warn(`⚠️ [Cover Cache] Failed to get cover for book ${bookId}:`, error);
            return null;
        }
    }

    /**
     * Download a single cover image asynchronously with improved caching
     */
    private async downloadCoverAsync(
        bookId: string, 
        coverImageId: string, 
        bookTitle: string, 
        onCoverReady: (bookId: string, coverUrl: string) => void
    ): Promise<void> {
        try {
            console.log(`[Cover Debug] Starting cover download for book: ${bookTitle} (ID: ${bookId})`);
            
            const coverUrl = await this.getPersistentCoverUrl(bookId, coverImageId);
            if (coverUrl) {
                console.log(`✅ [Cover Debug] Cover ready for: ${bookTitle}`);
                onCoverReady(bookId, coverUrl);
            } else {
                console.warn(`⚠️ [Cover Debug] No cover available for book ${bookTitle}`);
            }
        } catch (error) {
            console.warn(`⚠️ [Cover Debug] Failed to download cover for book ${bookTitle}:`, error);
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
            this.clearBookListCache();
            
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
            const oldCoverUrl = this.coverUrlCache.get(bookId);
            if (oldCoverUrl) {
                URL.revokeObjectURL(oldCoverUrl);
                this.coverUrlCache.delete(bookId);
            }

            // Clear book list cache since cover has changed
            this.clearBookListCache();

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
     * Sync the user's books with their connected cloud provider.
     * Currently implemented for Google Drive only.
     */
    async syncBooks(clerkUser?: any, onCoverReady?: (bookId: string, coverUrl: string) => void): Promise<BookMetadata[]> {
        console.log('Syncing books with cloud storage...');

        const provider = this.detectProviderFromClerkUser(clerkUser);

        switch (provider) {
            case 'google':
                if (!gDriveService.isSignedIn()) {
                    throw new Error('Google Drive not connected. Please connect first.');
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

    async getReadingProgress(bookId: string): Promise<ReadingProgress | null> {
        console.log('Getting reading progress for book:', bookId);
        try {
            // First try local storage for immediate access
            const localKey = `reading_progress_${bookId}`;
            const localProgress = localStorage.getItem(localKey);
            
            if (localProgress) {
                try {
                    const parsed = JSON.parse(localProgress);
                    return {
                        ...parsed,
                        lastUpdated: new Date(parsed.lastUpdated)
                    };
                } catch (error) {
                    console.warn('Failed to parse local reading progress:', error);
                    localStorage.removeItem(localKey);
                }
            }

            // Fallback to cloud storage if connected
            if (gDriveService.isSignedIn()) {
                try {
                    const metadataInfo = await gDriveService.getMetadataFile();
                    if (metadataInfo?.data?.progress?.[bookId]) {
                        const cloudProgress = metadataInfo.data.progress[bookId];
                        const progress: ReadingProgress = {
                            ...cloudProgress,
                            lastUpdated: new Date(cloudProgress.lastUpdated)
                        };
                        
                        // Cache to local storage for faster access
                        localStorage.setItem(localKey, JSON.stringify(progress));
                        return progress;
                    }
                } catch (error) {
                    console.warn('Failed to get progress from cloud metadata:', error);
                }
            }

            return null;
        } catch (error) {
            console.error('Error fetching reading progress:', error);
            return null;
        }
    }

    async saveReadingProgress(progress: ReadingProgress): Promise<void> {
        console.log('Saving reading progress:', progress);
        try {
            // Always save to local storage first for immediate access
            const localKey = `reading_progress_${progress.bookId}`;
            const progressToStore = {
                ...progress,
                lastUpdated: new Date().toISOString()
            };
            localStorage.setItem(localKey, JSON.stringify(progressToStore));
            
            // Also save to cloud metadata if connected
            if (gDriveService.isSignedIn()) {
                try {
                    const metadataInfo = await gDriveService.getMetadataFile();
                    if (metadataInfo) {
                        const { fileId, data } = metadataInfo;
                        
                        // Initialize progress section if it doesn't exist
                        if (!data.progress) {
                            data.progress = {};
                        }
                        
                        // Update progress for this book
                        data.progress[progress.bookId] = progressToStore;
                        
                        // Save back to cloud
                        const success = await gDriveService.updateMetadataFile(fileId, data);
                        if (success) {
                            console.log('Reading progress synced to cloud successfully');
                        } else {
                            console.warn('Failed to sync progress to cloud, but local save succeeded');
                        }
                    }
                } catch (error) {
                    console.warn('Failed to sync progress to cloud metadata:', error);
                    // Don't throw - local storage save succeeded
                }
            }

            console.log('Reading progress saved successfully');
        } catch (error) {
            console.error('Error saving reading progress:', error);
            throw error;
        }
    }

    /**
     * Convenient method to save reading progress for a book
     */
    async saveBookProgress(
        bookId: string, 
        currentChapter: number, 
        currentPosition: number = 0, 
        currentPage?: number,
        totalPages?: number,
        fileType?: string
    ): Promise<void> {
        const progress: ReadingProgress = {
            bookId,
            userId: 'current-user', // We don't track user IDs in this privacy-first app
            currentChapter,
            currentPosition,
            currentPage,
            totalPages,
            fileType,
            lastUpdated: new Date()
        };
        
        return this.saveReadingProgress(progress);
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
     * Only clean up URLs that are no longer in use
     */
    cleanupBlobUrls(books: BookMetadata[]): void {
        // Get the set of book IDs that are still in use
        const activeBookIds = new Set(books.map(b => b.id));
        
        // Clean up cached URLs for books that are no longer in the list
        for (const [bookId, coverUrl] of this.coverUrlCache.entries()) {
            if (!activeBookIds.has(bookId)) {
                URL.revokeObjectURL(coverUrl);
                this.coverUrlCache.delete(bookId);
                console.log(`[Cover Cache] Cleaned up unused cover URL for book ${bookId}`);
            }
        }
    }

    /**
     * Get a cover URL for a book if it's already cached
     */
    getCachedCoverUrl(bookId: string): string | null {
        return this.coverUrlCache.get(bookId) || null;
    }

    // Clear book list cache when books are modified
    private clearBookListCache(): void {
        this.bookListCache = null;
    }

    /**
     * Test if a blob URL is still valid and points to an image
     */
    private async testBlobUrl(url: string): Promise<boolean> {
        return new Promise((resolve) => {
            const img = new Image();

            const timeoutId = setTimeout(() => {
                console.warn('⏰ Blob URL validation timeout');
                resolve(false);
            }, 3000);

            img.onload = () => {
                clearTimeout(timeoutId);
                console.log(`✅ Blob URL is valid: ${img.width}x${img.height}`);
                resolve(true);
            };

            img.onerror = () => {
                clearTimeout(timeoutId);
                console.warn('❌ Blob URL is not valid or not an image');
                resolve(false);
            };

            img.src = url;
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

            const timeoutId = setTimeout(() => {
                URL.revokeObjectURL(url);
                console.warn('⏰ Image validation timeout');
                resolve(false);
            }, 5000);

            img.onload = () => {
                clearTimeout(timeoutId);
                URL.revokeObjectURL(url);
                console.log(`✅ Blob is valid image: ${img.width}x${img.height}`);
                resolve(true);
            };

            img.onerror = () => {
                clearTimeout(timeoutId);
                URL.revokeObjectURL(url);
                console.warn('❌ Blob is not a valid image');
                resolve(false);
            };

            img.src = url;
        });
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
            if (!gDriveService.isSignedIn()) {
                console.warn('Cannot load settings: Google Drive not connected');
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
        await gDriveService.saveVocab(words);
    }

    /**
     * Load vocabulary list from cloud storage
     */
    async loadVocabulary(): Promise<any[] | null> {
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
        const provider = this.detectProviderFromClerkUser(clerkUser);
        
        switch (provider) {
            case 'google':
                return await gDriveService.getFolders();
            case 'microsoft':
                throw new Error('OneDrive folder retrieval not yet implemented');
            case 'apple':
                throw new Error('iCloud folder retrieval not yet implemented');
            default:
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

export const storageService = new StorageService();

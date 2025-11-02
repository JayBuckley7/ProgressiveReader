import { BookMetadata, ReadingProgress } from '~/types';
import { getCachedFile, cacheFile } from '@integrations/googleDrive/services/driveCache';
import { gDriveService } from '@integrations/googleDrive/gdriveService';

// Request deduplication cache to prevent multiple simultaneous requests for the same resource
const activeDownloads = new Map<string, Promise<Blob>>();

// Declare global types for epub.js and pdf.js
declare global {
    interface Window {
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
        pdfjsLib?: any;
    }
}

/**
 * Book storage service for file operations and reading progress
 */
class BookStorageService {
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

    /**
     * Extract cover image from EPUB file using epub.js
     */
    async extractCoverFromEpub(file: File): Promise<Blob | null> {
        try {
            // Load epub.js dynamically if not already loaded
            if (!window.ePub) {
                await this.loadEpubJs();
            }

            const ePub = window.ePub;
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
    async extractCoverFromPdf(file: File): Promise<Blob | null> {
        try {
            await this.loadPdfJs();
            const pdfjsLib = window.pdfjsLib;
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
            if (!context) {
                throw new Error('Failed to get canvas context');
            }
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: context, viewport }).promise;

            return await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg');
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
            if (window.ePub && window.JSZip) {
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
        if (window.pdfjsLib) {
            return;
        }
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        const pdfjsLib = window.pdfjsLib;
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
        if (!window.JSZip) {
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
            if (!window.JSZip) {
                throw new Error('JSZip failed to load');
            }
        }

        // Then load epub.js if not already loaded
        if (!window.ePub) {
            await this.loadScript('https://unpkg.com/epubjs@0.3.93/dist/epub.min.js');
            if (!window.ePub) {
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
                    
                    if ((isJSZip && window.JSZip) || 
                        (isEpub && window.ePub) ||
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
        // Only log in development mode to reduce spam
        if (process.env.NODE_ENV === 'development') {
            console.log('Saving reading progress for book:', progress.bookId);
        }
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
                            //// console.log('Reading progress synced to cloud successfully');
                        } else {
                            console.warn('Failed to sync progress to cloud, but local save succeeded');
                        }
                    }
                } catch (error) {
                    console.warn('Failed to sync progress to cloud metadata:', error);
                    // Don't throw - local storage save succeeded
                }
            }

            // Only log success in development mode
            if (process.env.NODE_ENV === 'development') {
                console.log('Reading progress saved successfully');
            }
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
}

export const bookStorageService = new BookStorageService();


import { BookMetadata } from '~/types';
import {
import { appLog } from '@shared/appLog'
    getCachedCover,
    cacheCover,
    getCoverForFile,
    cacheCoverForFile,
} from '@integrations/googleDrive/services/driveCache';
import { gDriveService } from '@integrations/googleDrive/gdriveService';

/**
 * Book cache service for managing in-memory caches and cover URLs
 */
class BookCacheService {
    // Cache for book metadata to prevent redundant API calls
    private bookListCache: { data: BookMetadata[], timestamp: number } | null = null;
    private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

    // Cache for blob URLs to prevent recreating them
    private coverUrlCache = new Map<string, string>();

    // Track active cover downloads to prevent duplicates
    private activeCoverDownloads = new Map<string, Promise<string | null>>();

    /**
     * Get a cover URL for a book if it's already cached
     */
    getCachedCoverUrl(bookId: string): string | null {
        return this.coverUrlCache.get(bookId) || null;
    }

    /**
     * Get or create a persistent cover URL for a book
     * This method checks cache first and reuses blob URLs when possible
     */
    async getPersistentCoverUrl(bookId: string, coverImageId: string): Promise<string | null> {
        // Check if we already have a cached URL for this book
        const cachedUrl = this.coverUrlCache.get(bookId);
        if (cachedUrl) {
            // Verify the URL is still valid by trying to create an image
            try {
                const isValid = await this.testBlobUrl(cachedUrl);
                if (isValid) {
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
            appLog.debug(`[Cover Cache] Download in progress for book ${bookId}, waiting...`);
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
                appLog.debug(`[Cover Cache] Found cover in file cache for book ${bookId}`);
            } else {
                // Check cover-level cache
                coverBlob = await getCachedCover(coverImageId);
                if (coverBlob) {
                    appLog.debug(`[Cover Cache] Found cover in cover cache for book ${bookId}`);
                    await cacheCoverForFile(bookId, coverBlob);
                } else {
                    // Download from Google Drive
                    appLog.debug(`[Cover Cache] Downloading cover from Google Drive for book ${bookId}`);
                    coverBlob = await gDriveService.downloadFile(coverImageId);
                    if (coverBlob) {
                        await cacheCover(coverImageId, coverBlob);
                        await cacheCoverForFile(bookId, coverBlob);
                        appLog.debug(`[Cover Cache] Downloaded and cached cover for book ${bookId}`);
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
                    appLog.debug(`✅ [Cover Cache] Created persistent URL for book ${bookId}`);
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

    // Concurrency control for background downloads
    private downloadQueue: (() => Promise<void>)[] = [];
    private activeDownloadCount = 0;
    private readonly CONCURRENCY_LIMIT = 3;

    private async processDownloadQueue() {
        if (this.activeDownloadCount >= this.CONCURRENCY_LIMIT || this.downloadQueue.length === 0) {
            return;
        }

        this.activeDownloadCount++;
        const task = this.downloadQueue.shift();

        if (task) {
            try {
                await task();
            } catch (err) {
                console.warn('[Cover Cache] Error in queued download task:', err);
            } finally {
                this.activeDownloadCount--;
                this.processDownloadQueue();
            }
        }
    }

    /**
     * Download a single cover image asynchronously with improved caching and concurrency control
     */
    async downloadCoverAsync(
        bookId: string,
        coverImageId: string,
        bookTitle: string,
        onCoverReady: (bookId: string, coverUrl: string) => void
    ): Promise<void> {
        // Wrap the download in a queued task
        const task = async () => {
            try {
                appLog.debug(`[Cover Debug] Starting cover download for book: ${bookTitle} (ID: ${bookId})`);

                const coverUrl = await this.getPersistentCoverUrl(bookId, coverImageId);
                if (coverUrl) {
                    appLog.debug(`✅ [Cover Debug] Cover ready for: ${bookTitle}`);
                    onCoverReady(bookId, coverUrl);
                } else {
                    console.warn(`⚠️ [Cover Debug] No cover available for book ${bookTitle}`);
                }
            } catch (error) {
                console.warn(`⚠️ [Cover Debug] Failed to download cover for book ${bookTitle}:`, error);
            }
        };

        this.downloadQueue.push(task);
        this.processDownloadQueue();
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
                appLog.debug(`[Cover Cache] Cleaned up unused cover URL for book ${bookId}`);
            }
        }
    }

    /**
     * Get book list cache if valid, null otherwise
     */
    getBookListCache(): BookMetadata[] | null {
        const now = Date.now();
        if (this.bookListCache && (now - this.bookListCache.timestamp < this.CACHE_DURATION)) {
            return this.bookListCache.data;
        }
        return null;
    }

    /**
     * Set book list cache
     */
    setBookListCache(books: BookMetadata[]): void {
        this.bookListCache = {
            data: books,
            timestamp: Date.now()
        };
    }

    /**
     * Clear book list cache when books are modified
     */
    clearBookListCache(): void {
        this.bookListCache = null;
    }

    /**
     * Clear cover URL cache for a specific book
     */
    clearCoverUrlCache(bookId: string): void {
        const oldCoverUrl = this.coverUrlCache.get(bookId);
        if (oldCoverUrl) {
            URL.revokeObjectURL(oldCoverUrl);
            this.coverUrlCache.delete(bookId);
        }
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
                appLog.debug(`✅ Blob URL is valid: ${img.width}x${img.height}`);
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
                appLog.debug(`✅ Blob is valid image: ${img.width}x${img.height}`);
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
}

export const bookCacheService = new BookCacheService();


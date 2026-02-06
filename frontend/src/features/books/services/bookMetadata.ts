import { BookMetadata, Folder } from '~/types';
import { gDriveService, BOOK_FILE_EXTENSIONS } from '@integrations/googleDrive/gdriveService';
import { authManager } from '@shared/services/authManager';
import { removeCachedCover, removeCoverForFile } from '@integrations/googleDrive/services/driveCache';
import { bookCacheService } from './bookCache';
import { bookStorageService } from './bookStorage';
import { processPDFWithOCR, OCRProgressCallback } from './ocrApi';
import { toast } from 'sonner';
import { appLog } from '@shared/appLog'

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
            appLog.debug('No external accounts found, defaulting to email provider');
            return 'email';
        }

        // Get the first external account's provider
        const provider = clerkUser.externalAccounts[0]?.provider;
        appLog.debug('Detected Clerk provider:', provider);
        
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

    async lookupCover(title: string): Promise<Blob | undefined> {
        const cleaned = (title || "").trim();
        if (!cleaned) return undefined;

        const params = new URLSearchParams({ title: cleaned });
        const controller = new AbortController();
        const timeoutId = globalThis.setTimeout(() => controller.abort(), 4500);

        try {
            const response = await fetch(`/api/covers/lookup?${params.toString()}`, {
                method: 'GET',
                signal: controller.signal,
            });
            if (response.status === 204) return undefined;
            if (!response.ok) return undefined;
            const blob = await response.blob();
            if (!blob || blob.size === 0) return undefined;
            if (blob.type && !blob.type.startsWith('image/')) return undefined;
            return blob;
        } catch {
            return undefined;
        } finally {
            globalThis.clearTimeout(timeoutId);
        }
    }

    private normalizeTitleForCover(title: string): string {
        const raw = (title || '').trim();
        if (!raw) return '';

        let cleaned = raw.replace(/[_-]+/g, ' ');
        cleaned = cleaned.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '');
        cleaned = cleaned.replace(/\s*\([^)]{1,120}\)\s*$/, '');
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned || raw;
    }

    private titleMonogram(title: string): string {
        const cleaned = this.normalizeTitleForCover(title).trim();
        if (!cleaned) return 'B';
        return cleaned.slice(0, 1).toUpperCase();
    }

    private hashString(input: string): number {
        let hash = 2166136261;
        for (let i = 0; i < input.length; i += 1) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    private wrapText(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        text: string,
        maxWidth: number,
        maxLines: number
    ): string[] {
        const trimmed = (text || '').trim();
        if (!trimmed) return [];

        const lines: string[] = [];
        let current = '';
        let truncated = false;

        for (const ch of trimmed) {
            const next = current + ch;
            const width = ctx.measureText(next).width;
            if (width <= maxWidth || current.length === 0) {
                current = next;
                continue;
            }

            lines.push(current.trim());
            current = ch;

            if (lines.length >= maxLines) {
                truncated = true;
                break;
            }
        }

        if (lines.length < maxLines && current.trim()) {
            lines.push(current.trim());
        } else if (current && lines.length >= maxLines) {
            truncated = true;
        }

        if (truncated && lines.length > 0) {
            const last = lines[lines.length - 1];
            if (!last.endsWith('…')) {
                lines[lines.length - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
            }
        }

        return lines.slice(0, maxLines);
    }

    private async blobToDataUrl(blob: Blob): Promise<string> {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
        });
    }

    async getCachedPlaceholderCoverUrl(
        bookId: string,
        title: string,
        fileType?: string,
        author?: string
    ): Promise<string | null> {
        if (typeof window === 'undefined') return null;
        const key = `prPlaceholderCover:${bookId}`;
        const normalizedTitle = (title || '').trim();
        const normalizedAuthor = (author || '').trim();
        const normalizedFileType = (fileType || '').trim().toLowerCase();

        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached) as {
                        v?: number;
                        t?: string;
                        a?: string;
                        f?: string;
                        d?: string;
                    };

                    if (
                        parsed &&
                        typeof parsed.d === 'string' &&
                        (parsed.t || '') === normalizedTitle &&
                        (parsed.a || '') === normalizedAuthor &&
                        (parsed.f || '') === normalizedFileType
                    ) {
                        return parsed.d;
                    }
                } catch {
                    if (cached.startsWith('data:image/')) {
                        return cached;
                    }
                }
            }
        } catch { }

        const blob = await this.generatePlaceholderCover(title, fileType, author);
        const dataUrl = await this.blobToDataUrl(blob);
        try {
            localStorage.setItem(
                key,
                JSON.stringify({
                    v: 1,
                    t: normalizedTitle,
                    a: normalizedAuthor,
                    f: normalizedFileType,
                    d: dataUrl,
                })
            );
        } catch { }
        return dataUrl;
    }

    async generatePlaceholderCover(title: string, fileType?: string, author?: string): Promise<Blob> {
        const width = 600;
        const height = 800;
        const normalized = this.normalizeTitleForCover(title);

        const palettes = [
            { bg: '#f6f1e4', ink: '#1b1f24', accent: '#7a2e2e', border: '#ded6c6', muted: '#5f6b79' },
            { bg: '#f3ede7', ink: '#1e1b16', accent: '#8a3d1c', border: '#dfd4c9', muted: '#6a5643' },
            { bg: '#faf6ef', ink: '#14181f', accent: '#6b4f2a', border: '#e5dbcf', muted: '#5b6472' },
            { bg: '#f4f1ea', ink: '#14181f', accent: '#9a3412', border: '#e2d7cb', muted: '#5b6472' },
        ];

        const palette = palettes[this.hashString(normalized || title) % palettes.length];

        const monogram = this.titleMonogram(normalized || title);
        const badge = (fileType || '').trim().slice(0, 8).toUpperCase();
        const authorText = (author || '').trim();

        const makeSvgFallback = () => {
            const safeTitle = (normalized || title || 'Untitled').replace(/&/g, '&amp;').replace(/</g, '&lt;');
            const safeAuthor = authorText.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
                `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
                `<rect width="100%" height="100%" fill="${palette.bg}"/>` +
                `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="${palette.border}" stroke-width="2"/>` +
                `<text x="50%" y="44%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif" font-size="220" font-weight="700" fill="${palette.accent}" opacity="0.9">${monogram}</text>` +
                `<text x="48" y="${height - 148}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif" font-size="32" font-weight="600" fill="${palette.ink}">${safeTitle}</text>` +
                (safeAuthor ? `<text x="48" y="${height - 108}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif" font-size="18" font-weight="500" fill="${palette.muted}">${safeAuthor}</text>` : '') +
                (badge ? `<text x="48" y="64" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="14" font-weight="700" fill="${palette.muted}">${badge}</text>` : '') +
                `</svg>`;
            return new Blob([svg], { type: 'image/svg+xml' });
        };

        let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
        let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

        try {
            if (typeof OffscreenCanvas !== 'undefined') {
                canvas = new OffscreenCanvas(width, height);
                ctx = canvas.getContext('2d');
            } else if (typeof document !== 'undefined') {
                const el = document.createElement('canvas');
                el.width = width;
                el.height = height;
                canvas = el;
                ctx = el.getContext('2d');
            }
        } catch {
            canvas = null;
            ctx = null;
        }

        if (!canvas || !ctx) {
            return makeSvgFallback();
        }

        // Background
        ctx.fillStyle = palette.bg;
        ctx.fillRect(0, 0, width, height);

        // Subtle diagonal texture
        ctx.save();
        ctx.translate(width * 0.15, height * 0.05);
        ctx.rotate((-18 * Math.PI) / 180);
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = palette.accent;
        for (let x = -width; x < width * 2; x += 22) {
            ctx.fillRect(x, 0, 2, height * 2);
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        // Border
        ctx.strokeStyle = palette.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(24, 24, width - 48, height - 48);

        // Badge
        if (badge) {
            ctx.fillStyle = palette.border;
            ctx.fillRect(44, 48, 84, 28);
            ctx.fillStyle = palette.ink;
            ctx.font = '700 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(badge, 52, 62);
        }

        // Monogram
        ctx.fillStyle = palette.accent;
        ctx.font = '700 220px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(monogram, width / 2, height * 0.44);

        // Title + author
        const titleText = normalized || title || 'Untitled';
        ctx.fillStyle = palette.ink;
        ctx.font = '600 34px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        const titleLines = this.wrapText(ctx, titleText, width - 96, 2);
        const baseY = height - 140;
        for (let i = 0; i < titleLines.length; i += 1) {
            ctx.fillText(titleLines[i], 48, baseY + i * 40);
        }

        if (authorText) {
            ctx.fillStyle = palette.muted;
            ctx.font = '500 18px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
            const authorLines = this.wrapText(ctx, authorText, width - 96, 1);
            if (authorLines[0]) {
                ctx.fillText(authorLines[0], 48, height - 64);
            }
        }

        try {
            if (canvas instanceof OffscreenCanvas) {
                return await canvas.convertToBlob({ type: 'image/png' });
            }

            return await new Promise<Blob>((resolve) => {
                (canvas as HTMLCanvasElement).toBlob((blob) => {
                    resolve(blob || makeSvgFallback());
                }, 'image/png');
            });
        } catch {
            return makeSvgFallback();
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
        appLog.debug('Uploading book to user\'s cloud storage. Privacy-first: no content stored in our backend.');
        
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
                        appLog.debug('Attempting to extract cover from EPUB file...');
                        try {
                            const extractedCover = await bookStorageService.extractCoverFromEpub(file);
                            if (extractedCover) {
                                coverBlob = extractedCover;
                                appLog.debug('✅ Cover extracted from EPUB successfully');
                            } else {
                                appLog.debug('📖 No cover found in EPUB file');
                            }
                        } catch (error) {
                            console.warn('⚠️ Failed to extract cover from EPUB:', error);
                        }
                    } else if (!coverBlob && meta.fileType === 'pdf') {
                        const extracted = await bookStorageService.extractCoverFromPdf(file);
                        if (extracted) coverBlob = extracted;
                    }

                    if (!coverBlob) {
                        appLog.debug('No embedded cover found; attempting cover lookup by title...');
                        const lookedUpCover = await this.lookupCover(meta.title);
                        if (lookedUpCover) {
                            coverBlob = lookedUpCover;
                            appLog.debug('✅ Cover found via lookup');
                        } else {
                            appLog.debug('No cover found via lookup');
                        }
                    }

                    if (!coverBlob) {
                        appLog.debug('No cover available; generating placeholder cover...');
                        coverBlob = await this.generatePlaceholderCover(meta.title, meta.fileType);
                    }

                    // Process PDF with OCR if requested
                    let fileToUpload = file;
                    if (meta.processOCR && meta.fileType === 'pdf') {
                        try {
                            appLog.debug('Processing PDF with OCR...');
                            fileToUpload = await processPDFWithOCR(file, onOCRProgress);
                            appLog.debug('✅ PDF processed with OCR successfully');
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
                        const mime = coverBlob.type || 'image/jpeg';
                        const ext = mime.includes('png')
                            ? 'png'
                            : mime.includes('webp')
                                ? 'webp'
                                : mime.includes('svg')
                                    ? 'svg'
                                    : 'jpg';
                        const coverFileName = `${meta.title}_cover.${ext}`;
                        const coverResult = await gDriveService.uploadFile(
                            coverFileName,
                            coverBlob,
                            mime
                        );
                        
                        if (coverResult) {
                            coverImageId = coverResult.id;
                            appLog.debug('✅ Cover image uploaded successfully');
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

                    appLog.debug('✅ Book uploaded to user\'s cloud storage successfully. Privacy-first: no metadata stored in our backend.');
            
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
        appLog.debug('getUserBooks: Fetching book list from user\'s Google Drive...');
        const isJsonFileType = (fileType?: string | null) => (fileType || '').toLowerCase() === 'json';
        
        try {
            // CRITICAL: Check Clerk authentication first before accessing Google Drive
            if (typeof window !== 'undefined' && window.Clerk) {
                const clerkUser = window.Clerk.user;
                const isClerkSignedIn = window.Clerk.session !== null;
                
                if (!clerkUser || !isClerkSignedIn) {
                    appLog.debug('getUserBooks: Clerk user not authenticated, skipping Google Drive access');
                    return [];
                }
            } else {
                appLog.debug('getUserBooks: Clerk not available, skipping Google Drive access');
                return [];
            }

            // Check if user is signed in to Google Drive
            if (!gDriveService.isSignedIn()) {
                appLog.debug('User not signed in to Google Drive');
                return [];
            }

            // Check cache first to prevent redundant API calls
            const cachedBooks = bookCacheService.getBookListCache();
            if (cachedBooks) {
                const cachedLibraryBooks = cachedBooks.filter(book => !isJsonFileType(book.fileType));
                if (cachedLibraryBooks.length !== cachedBooks.length) {
                    appLog.debug('getUserBooks: Filtered JSON test files from cached library list');
                }
                // Update books with current cached cover URLs and trigger callbacks
                const updatedBooks = cachedLibraryBooks.map(book => {
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
                appLog.debug('No metadata file found, returning empty list');
                return [];
            }

            const { data: metadata } = metadataInfo;
            const bookEntries = metadata.books || {};
            const coverEntries = metadata.covers || {};

            appLog.debug('Found book entries in metadata:', Object.keys(bookEntries).length);

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
                    appLog.debug(`Skipping non-book entry ${bookMeta.fileName || bookFileId}`);
                    continue;
                }
                if (isJsonFileType(extFromMeta)) {
                    appLog.debug(`Skipping JSON test file ${bookMeta.fileName || bookFileId} from library view`);
                    continue;
                }

                // Skip if the book file no longer exists in Drive
                if (!driveFileIds.has(bookFileId)) {
                    appLog.debug(`Book file ${bookFileId} no longer exists in Drive, skipping`);
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
                        appLog.debug(`[Cover Debug] Initiating cover download for book: ${bookMetadata.title} (ID: ${bookFileId})`);
                        const coverTask = bookCacheService.downloadCoverAsync(bookFileId, coverImageId, bookMetadata.title, onCoverReady);
                        coverDownloadTasks.push(coverTask);
                    } else {
                        // Immediately call the callback with the cached URL
                        onCoverReady(bookFileId, cachedCoverUrl);
                    }
                } else {
                    if (!coverImageId) {
                        appLog.debug(`[Cover Debug] No cover image ID for book: ${bookMetadata.title}`);
                    } else if (!driveFileIds.has(coverImageId)) {
                        appLog.debug(`[Cover Debug] Cover image ID not found in drive files for book: ${bookMetadata.title} (CoverID: ${coverImageId})`);
                    } else if (!onCoverReady) {
                        appLog.debug(`[Cover Debug] No onCoverReady callback provided for book: ${bookMetadata.title}`);
                    }
                }
            }

            appLog.debug(`Processed ${books.length} books from metadata (covers downloading in background)`);
            
            // Log summary of books with/without covers
            const booksWithCovers = books.filter(book => book.coverImageId);
            const booksWithoutCovers = books.filter(book => !book.coverImageId);
            appLog.debug(`[Cover Summary] Books with covers: ${booksWithCovers.length}/${books.length}`);
            appLog.debug(`[Cover Summary] Books with covers:`, booksWithCovers.map(b => b.title));
            appLog.debug(`[Cover Summary] Books without covers:`, booksWithoutCovers.map(b => b.title));
            
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
        appLog.debug('deleteBook: Deleting book from user\'s Google Drive. Book ID:', id);
        
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

            appLog.debug('✅ Book file deleted from Google Drive successfully');

            // Delete cover image if it exists
            if (coverImageId) {
                const coverDeleteSuccess = await gDriveService.deleteFile(coverImageId);
                if (coverDeleteSuccess) {
                    appLog.debug('✅ Cover image deleted from Google Drive successfully');
                } else {
                    console.warn('⚠️ Failed to delete cover image, but book deletion succeeded');
                }
            }

            // Remove from metadata.json
            const metadataUpdateSuccess = await gDriveService.removeBookMetadata(id);
            if (!metadataUpdateSuccess) {
                console.warn('⚠️ Failed to update metadata file, but book deletion succeeded');
            } else {
                appLog.debug('✅ Book metadata removed successfully');
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
        appLog.debug('updateBookCover: Updating cover for book:', bookId);
        
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
            appLog.debug('✅ New cover image uploaded to Google Drive:', coverImageId);

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

            appLog.debug('✅ Book metadata updated with new cover');

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
                    appLog.debug('✅ Old cover image deleted from Google Drive');
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
        appLog.debug('updateBookMetadata: Updating metadata for book:', bookId, updates);
        
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

            appLog.debug('✅ Book metadata updated successfully');

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
        appLog.debug('Syncing books with cloud storage...');

        // CRITICAL: Check Clerk authentication first
        if (!clerkUser) {
            appLog.debug('syncBooks: No Clerk user provided, skipping sync');
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
        appLog.debug('Opening cloud storage folder...');
        
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
        appLog.debug('Saving settings to Google Drive settings.json...');

        try {
            if (!gDriveService.isSignedIn()) {
                console.warn('Cannot save settings: Google Drive not connected');
                return false;
            }

            const success = await gDriveService.saveSettings(settings);
            if (success) {
                appLog.debug('✅ Settings saved to Google Drive successfully');
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
        appLog.debug('Loading settings from Google Drive settings.json...');

        try {
            // CRITICAL: Check Clerk authentication first
            if (typeof window !== 'undefined' && window.Clerk) {
                const clerkUser = window.Clerk.user;
                const isClerkSignedIn = window.Clerk.session !== null;
                
                if (!clerkUser || !isClerkSignedIn) {
                    appLog.debug('loadSettings: Clerk user not authenticated, skipping Google Drive access');
                    return null;
                }
            } else {
                appLog.debug('loadSettings: Clerk not available, skipping Google Drive access');
                return null;
            }

            const isAuthenticated = await authManager.ensureAuthenticated();
            if (!isAuthenticated) {
                console.warn('Cannot load settings: Google Drive authentication failed');
                return null;
            }

            const settings = await gDriveService.loadSettings();
            if (settings) {
                appLog.debug('✅ Settings loaded from Google Drive successfully');
                return settings;
            } else {
                appLog.debug('ℹ️ No settings found in Google Drive');
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
            appLog.debug('saveVocabulary: Authentication failed, cannot save vocabulary');
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
            appLog.debug('loadVocabulary: Authentication failed, cannot load vocabulary');
            return null;
        }

        return await gDriveService.loadVocab();
    }

    /**
     * Save grammar progress to cloud storage
     */
    async saveGrammarProgress(knownIds: string[]): Promise<void> {
        const isAuthenticated = await authManager.ensureAuthenticated();
        if (!isAuthenticated) {
            appLog.debug('saveGrammarProgress: Authentication failed, cannot save grammar progress');
            return;
        }

        await gDriveService.saveGrammarProgress(knownIds);
    }

    /**
     * Load grammar progress from cloud storage
     */
    async loadGrammarProgress(): Promise<string[] | null> {
        const isAuthenticated = await authManager.ensureAuthenticated();
        if (!isAuthenticated) {
            appLog.debug('loadGrammarProgress: Authentication failed, cannot load grammar progress');
            return null;
        }

        return await gDriveService.loadGrammarProgress();
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
        appLog.debug('📁 [StorageService] getFolders called with clerkUser:', !!clerkUser);
        
        // CRITICAL: Check Clerk authentication first
        if (!clerkUser) {
            appLog.debug('📁 [StorageService] getFolders: No Clerk user provided, returning empty folders');
            return [];
        }

        const provider = this.detectProviderFromClerkUser(clerkUser);
        appLog.debug('📁 [StorageService] Detected provider:', provider);
        
        switch (provider) {
            case 'google':
                appLog.debug('📁 [StorageService] Calling gDriveService.getFolders()...');
                const folders = await gDriveService.getFolders();
                appLog.debug('📁 [StorageService] gDriveService.getFolders() returned:', folders.length, 'folders');
                return folders;
            case 'microsoft':
                throw new Error('OneDrive folder retrieval not yet implemented');
            case 'apple':
                throw new Error('iCloud folder retrieval not yet implemented');
            default:
                appLog.debug('📁 [StorageService] Unknown provider, returning empty folders');
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

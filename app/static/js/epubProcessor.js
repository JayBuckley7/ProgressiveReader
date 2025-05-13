/**
 * EpubProcessorWrapper
 * 
 * A wrapper for epub.js that abstracts away its complexity
 * Provides a simple interface for the reader to work with
 */

export class EpubProcessorWrapper {
    constructor() {
        this.processor = null;
        this.isReady = false;
        this.metadata = null;
        this.totalChapters = 0;
    }

    /**
     * Load a book from its binary content
     * @param {ArrayBuffer} bookBinaryContent - The book content as ArrayBuffer
     * @returns {Promise<boolean>} - Success or failure 
     */
    async loadBook(bookBinaryContent) {
        try {
            console.log('EpubProcessorWrapper: Loading book...');
            
            this.processor = this._createProcessor(bookBinaryContent);
            await this.processor.ensureReady(); // This now ensures the internal book object is ready
            
            this.metadata = await this.processor.getMetadata();
            this.totalChapters = await this.processor.getTotalChapters();
            this.isReady = true;
            
            console.log(`EpubProcessorWrapper: Book loaded successfully. Title: "${this.metadata.title || 'Untitled'}", Chapters: ${this.totalChapters}.`);
            return true;
        } catch (error) {
            console.error('EpubProcessorWrapper: Error loading book:', error);
            this.isReady = false;
            return false;
        }
    }

    getBookTitle() {
        if (!this.isReady || !this.metadata) {
            return "Untitled Book";
        }
        return this.metadata.title || "Untitled Book";
    }

    getTotalChapters() {
        return this.totalChapters;
    }

    async getIndexFromCfi(cfi) {
        if (!this.isReady || !this.processor) {
            return -1;
        }
        try {
            return await this.processor.getIndexFromCfi(cfi);
        } catch (error) {
            console.warn('EpubProcessorWrapper: Error resolving CFI:', error);
            return -1;
        }
    }

    /**
     * Get a specific chapter's processed HTML content (body content, images rewritten, scripts/styles removed)
     * @param {number} index - The chapter index
     * @returns {Promise<string|null>} - The processed chapter HTML (body innerHTML) or null if error
     */
    async getChapterHtml(index) {
        if (!this.isReady || !this.processor) {
            console.error('EpubProcessorWrapper: Not ready or no processor available for getChapterHtml');
            return null;
        }

        if (index < 0 || index >= this.totalChapters) {
            console.error('EpubProcessorWrapper: Invalid chapter index for getChapterHtml:', index);
            return null;
        }

        try {
            // The internal processor's getChapterHtml will now do the heavy lifting
            return await this.processor.getChapterHtml(index);
        } catch (error) {
            console.error(`EpubProcessorWrapper: Error getting processed chapter ${index}:`, error);
            return null;
        }
    }

    /**
     * Gets the Blob data for the book's cover image.
     * @returns {Promise<Blob|null>} - Blob of the cover or null.
     */
    async getCoverBlob() {
        if (!this.isReady || !this.processor) {
            console.error('EpubProcessorWrapper: Not ready or no processor available for getCoverBlob');
            return null;
        }
        try {
            await this.processor.ensureReady(); 
            const coverPathOrUrl = await this.processor.book.coverUrl();

            if (coverPathOrUrl) {
                let coverBlob = null;
                if (coverPathOrUrl.startsWith('blob:')) {
                    // It's already a blob URL. Fetch the blob data from this URL.
                    console.log('EpubProcessorWrapper: coverUrl is already a blob URL, fetching its content:', coverPathOrUrl);
                    try {
                        const response = await fetch(coverPathOrUrl);
                        if (!response.ok) {
                            throw new Error(`HTTP error when fetching blob URL: ${response.status} ${response.statusText}`);
                        }
                        coverBlob = await response.blob();
                        console.log('EpubProcessorWrapper: Successfully fetched Blob from blob URL.');
                    } catch (fetchError) {
                        console.error('EpubProcessorWrapper: Failed to fetch blob URL:', coverPathOrUrl, fetchError);
                        return null; // Could not get the blob
                    }
                } else {
                    // It's a path within the EPUB. Fetch using archive.request.
                    console.log('EpubProcessorWrapper: Fetching cover resource from archive path:', coverPathOrUrl);
                    coverBlob = await this.processor.book.archive.request(coverPathOrUrl, "blob");
                    if (!coverBlob) {
                         console.warn('EpubProcessorWrapper: coverPathOrUrl found but archive.request failed to return Blob.');
                         return null;
                    }
                    console.log('EpubProcessorWrapper: Successfully fetched Blob from archive.');
                }
                return coverBlob; // Return the fetched Blob
            } else {
                console.log('EpubProcessorWrapper: No cover URL found in EPUB metadata.');
                return null;
            }
        } catch (error) {
            console.error('EpubProcessorWrapper: Error getting cover Blob:', error);
            return null;
        }
    }

    _createProcessor(epubDataBuffer) {
        return new EpubProcessor(epubDataBuffer);
    }
}

// Helper function to load scripts dynamically
function loadScript(url) {
    return new Promise((resolve, reject) => {
        // Check if script already exists
        if (document.querySelector(`script[src="${url}"]`)) {
            console.log(`Script already loaded or loading: ${url}`);
            // Need a way to wait if it's currently loading by another instance.
            // For simplicity now, assume it's loaded if element exists.
            // A more robust solution might involve a global loading state.
            resolve(); 
            return;
        }
        
        const script = document.createElement('script');
        script.src = url;
        script.async = true; // Load asynchronously
        script.onload = () => {
            console.log(`Script loaded successfully: ${url}`);
            resolve();
        };
        script.onerror = (error) => {
            console.error(`Failed to load script: ${url}`, error);
            document.head.removeChild(script); // Clean up failed script tag
            reject(new Error(`Failed to load script: ${url}`));
        };
        document.head.appendChild(script);
    });
}

/**
 * Internal EpubProcessor class - this uses epub.js directly
 */
class EpubProcessor {
    constructor(epubDataBuffer) {
        if (!epubDataBuffer || !(epubDataBuffer instanceof ArrayBuffer)) {
            throw new Error("EpubProcessor (internal) requires an ArrayBuffer.");
        }
        this.book = null;
        this.isReady = false;
        this.epubJsLib = null; // To store the loaded ePub library
        this.jszip = null;     // To store the loaded JSZip library
        this.dependenciesLoaded = false;
        this.loadingPromise = null;
        
        // Start initialization, which now includes dependency loading
        this.readyPromise = this._initialize(epubDataBuffer); 
    }

    // Method to ensure dependencies are loaded
    async _ensureDependencies() {
        // Check if dependencies are already loaded by this instance
        if (this.dependenciesLoaded) {
            return true;
        }
        
        // Check if dependencies are currently being loaded by this instance
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        // Check global scope first (in case loaded traditionally or by another instance)
        if (window.JSZip && window.ePub) {
             console.log("EpubProcessor (internal): Dependencies (JSZip, ePub) found in global scope.");
             this.jszip = window.JSZip;
             this.epubJsLib = window.ePub;
             this.dependenciesLoaded = true;
             return true;
        }

        console.log("EpubProcessor (internal): Dependencies not found globally, attempting dynamic load...");
        // Create a promise to handle the loading process
        this.loadingPromise = (async () => {
            const jszipUrl = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            const epubjsUrl = 'https://unpkg.com/epubjs@0.3.93/dist/epub.min.js';
            
            try {
                console.log("EpubProcessor (internal): Loading JSZip...");
                await loadScript(jszipUrl);
                if (!window.JSZip) throw new Error("JSZip loaded but not found on window object.");
                this.jszip = window.JSZip; 
                console.log("EpubProcessor (internal): JSZip loaded.");

                console.log("EpubProcessor (internal): Loading epub.js...");
                await loadScript(epubjsUrl);
                if (!window.ePub) throw new Error("epub.js loaded but not found on window.ePub.");
                this.epubJsLib = window.ePub;
                console.log("EpubProcessor (internal): epub.js loaded.");
                
                this.dependenciesLoaded = true;
                this.loadingPromise = null; // Clear promise once done
                return true;
            } catch (error) {
                console.error("EpubProcessor (internal): Error loading dependencies:", error);
                this.loadingPromise = null; // Clear promise on error
                throw error; // Re-throw
            }
        })();
        
        return this.loadingPromise;
    }

    async _initialize(epubDataBuffer) {
        try {
            console.log('EpubProcessor (internal): Initializing - ensuring dependencies...');
            // Ensure dependencies are loaded before proceeding
            await this._ensureDependencies(); 
            
            // Now use the stored library references
            if (!this.epubJsLib) {
                throw new Error('Epub.js library failed to load or initialize.');
            }
             // JSZip might not be directly needed by EpubProcessor itself, 
             // but epub.js needs it globally. We loaded it for epub.js.
            
            console.log('EpubProcessor (internal): Dependencies ready, initializing with epub.js...');
            // epub.js can take various inputs, including ArrayBuffer
            this.book = this.epubJsLib(epubDataBuffer); // Use the stored library
            console.log('EpubProcessor (internal): ePub object created, waiting for book.ready...');
            await this.book.ready; // This populates spine, metadata, resources etc.
            console.log('EpubProcessor (internal): Book is ready.');
            
            if (!this.book.spine || !this.book.spine.spineItems || this.book.spine.spineItems.length === 0) {
                throw new Error('EPUB parsing failed or no spine items found after book.ready.');
            }
            this.isReady = true;
            console.log('EpubProcessor (internal): Initialization complete.');
        } catch (error) {
            console.error('EpubProcessor (internal): Initialization failed:', error);
            this.isReady = false;
            throw error;
        }
    }

    async ensureReady() {
        if (!this.isReady) {
            await this.readyPromise;
        }
        if (!this.isReady) {
             throw new Error("EpubProcessor (internal) could not be initialized.");
        }
    }

    // Helper to resolve relative paths against a base path (like chapter's path)
    _resolvePath(base, relative) {
        const stack = base.split("/");
        const parts = relative.split("/");
        stack.pop(); // remove current file name (or last component)
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] == ".")
                continue;
            if (parts[i] == "..")
                stack.pop();
            else
                stack.push(parts[i]);
        }
        return stack.join("/");
    }

    async getChapterHtml(index) {
        await this.ensureReady();
        if (index < 0 || index >= this.book.spine.spineItems.length) {
            console.error('EpubProcessor (internal): Invalid chapter index:', index);
            return null;
        }
        try {
            const spineItem = this.book.spine.get(index);
            if (!spineItem) {
                console.error('EpubProcessor (internal): Spine item not found for index:', index);
                return null;
            }

            // Load the chapter content as a Document object
            const chapterDocument = await spineItem.load(this.book.load.bind(this.book));
            const doc = chapterDocument; // Already a Document object

            // Get base href for the current chapter to resolve relative URLs
            const chapterBaseHref = spineItem.url || spineItem.href; 
            // If SPINEITEM.HREF is an absolute URL (e.g. from an exploded EPUB), we need to calculate the base path differently.
            // For now, assume it's a relative path from OPF or an absolute path within the archive.
            // More robustly: this.book.path.resolve(spineItem.href) might give a cleaner canonical path.
            // For resolving relative paths *within* the chapter content, the chapter's own path is the base.

            // 1. Rewrite image paths
            const images = doc.querySelectorAll('img[src], image[href], image[xlink\\:href]');
            for (const imgTag of images) {
                let originalSrc = imgTag.getAttribute('src') || imgTag.getAttribute('href') || imgTag.getAttribute('xlink:href');
                if (originalSrc) {
                    // Resolve the originalSrc relative to the chapter's path
                    const absoluteImgPathInEpub = this.book.path.resolve(chapterBaseHref, originalSrc);
                    try {
                        const blobUrl = await this.book.resources.getURL(absoluteImgPathInEpub);
                        if (blobUrl) {
                            if (imgTag.hasAttribute('src')) imgTag.setAttribute('src', blobUrl);
                            if (imgTag.hasAttribute('href')) imgTag.setAttribute('href', blobUrl);
                            if (imgTag.hasAttribute('xlink:href')) imgTag.setAttributeNS('http://www.w3.org/1999/xlink', 'href', blobUrl);
                        } else {
                            console.warn(`EpubProcessor (internal): Could not get blob URL for image: ${absoluteImgPathInEpub}`);
                        }
                    } catch (e) {
                        console.warn(`EpubProcessor (internal): Error getting URL for image ${absoluteImgPathInEpub}:`, e);
                    }
                }
            }

            // 2. Remove script tags
            doc.querySelectorAll('script').forEach(script => script.remove());

            // 3. Remove stylesheet links
            doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => link.remove());

            // 4. Return the innerHTML of the body, or the whole documentElement if no body
            if (doc.body) {
                return doc.body.innerHTML;
            } else if (doc.documentElement) {
                // This case might happen for some non-standard XHTML files in EPUBs
                console.warn('EpubProcessor (internal): Chapter has no body, returning documentElement.innerHTML');
                return doc.documentElement.innerHTML;
            } else {
                console.warn('EpubProcessor (internal): Chapter has no body or documentElement, returning empty string');
                return ''; // Should not happen with valid chapter documents
            }

        } catch (error) {
            console.error(`EpubProcessor (internal): Error processing chapter ${index}:`, error);
            return null;
        }
    }

    async getTotalChapters() {
        await this.ensureReady();
        return this.book.spine.spineItems.length;
    }
    
    async getMetadata() {
        await this.ensureReady();
        return this.book.packaging?.metadata || {}; 
    }
    
    async getIndexFromCfi(cfi) {
        await this.ensureReady();
        try {
            const spineItem = this.book.spine.get(cfi); // Changed from findByRef for clarity with CFI
            return spineItem ? spineItem.index : -1;
        } catch (error) {
            console.warn("EpubProcessor (internal): Could not resolve CFI to index:", cfi, error);
            return -1;
        }
    }
} 
import { ready as dbServiceReady, getBook, getProgress, saveProgress, updateLastOpened } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';


// readerJS.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('readerJS: DOMContentLoaded.');

    // Add debug click handlers to check for event interference
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-nav]');
        if (target) {
            console.log(`Click detected on ${target.getAttribute('data-nav')} navigation button`);
        }
    }, true); // Use capture phase to see this first

    // --- Select elements based on existing structure ---
    const viewerElement = document.querySelector('.epub-content'); // Use class selector
    // Navigation buttons (prevButton, nextButton) are no longer needed for dynamic loading.
    
    const configElement = document.getElementById('page-config');

    // --- Validate selected elements ---
    // Only viewerElement and configElement are critical now.
    if (!viewerElement || !configElement) {
        console.error("readerJS: Critical elements not found (viewer or config). Viewer cannot initialize.");
        if (viewerElement) viewerElement.innerHTML = "<p>Error: Core page elements missing for reader.</p>";
        else console.error("readerJS: .epub-content viewer element itself might be missing or page-config!");
        if (!configElement) console.error("readerJS: #page-config script tag missing.");
        return;
    }

    let config = {};
    try {
        config = JSON.parse(configElement.textContent);
    } catch (e) {
        console.error("readerJS: Failed to parse page configuration.", e);
        if (viewerElement) viewerElement.innerHTML = "<p>Error: Failed to load page configuration.</p>";
        return;
    }

    // Update navigation total items count - target the specific element from the template
    function updateNavigationCounts(totalChapters) {
        console.log(`readerJS: Updating navigation with total chapters: ${totalChapters}`);
        const currentIndex = config.currentIndex
        
        // Direct targeting for the navigation_bar macro element
        const NavSpans = document.querySelectorAll('.navigation span');
        //nav spans looks like this
        //{NavSpans[0]} = JLP-toggle-prev
        //{NavSpans[1]} = PageSpan 1 of 2 
        //{NavSpans[2]} = PageSpan 2 of 2

        // update the page counters
        let updated = 0;
        NavSpans.forEach(span => {
            if (span.dataset.role === 'page-counter' || (span.textContent && span.textContent.match(/Page \d+ of \d+/i))) {
                const oldText = span.textContent;
                // Use 0-based indexing (Page 0 of N) to match URL
                const newText = `Page ${currentIndex} of ${totalChapters - 1}`;
                span.textContent = newText;
                span.dataset.currentIndex = currentIndex;
                span.dataset.totalItems = totalChapters;
                console.log(`readerJS: Updated navigation counter from "${oldText}" to "${newText}"`);
                updated++;
            }
        });

        //update the prev and next buttons
        updatePrevNextButtons(totalChapters);
        console.log(`readerJS: Updated ${updated} navigation elements with total: ${totalChapters}`);
    }
    function updatePrevNextButtons(totalChapters) {
        const currentIndex = Number(config.currentIndex) || 0;
    
        // Walk over *both* nav bars (top & bottom)
        document.querySelectorAll('.navigation').forEach(nav => {
            const navRight = nav.querySelector('.nav-right');
            if (!navRight) return;
    
            // Wipe whatever Jinja stuffed in there
            navRight.textContent = '';
    
            // -- Previous --------------------------------------------------------
            if (currentIndex > 0) {
                const aPrev = document.createElement('a');
                aPrev.textContent = 'Previous';
                aPrev.href = `/read/${config.bookId}/${currentIndex - 1}`;
                aPrev.dataset.nav = 'prev';
                navRight.appendChild(aPrev);
            } else {
                const btnPrev = document.createElement('button');
                btnPrev.type = 'button';
                btnPrev.className = 'disabled-nav-btn';
                btnPrev.disabled = true;
                btnPrev.textContent = 'Previous';
                navRight.appendChild(btnPrev);
            }
    
            navRight.append(' | ');               // little divider
    
            // -- Next ------------------------------------------------------------
            if (currentIndex < totalChapters - 1) {
                const aNext = document.createElement('a');
                aNext.textContent = 'Next';
                aNext.href = `/read/${config.bookId}/${currentIndex + 1}`;
                aNext.dataset.nav = 'next';
                navRight.appendChild(aNext);
            } else {
                const btnNext = document.createElement('button');
                btnNext.type = 'button';
                btnNext.className = 'disabled-nav-btn';
                btnNext.disabled = true;
                btnNext.textContent = 'Next';
                navRight.appendChild(btnNext);
            }
        });
    }
    // Handle TOC rendering for the side drawer
    function renderTableOfContents(chapterTitles, epubWrapper) {
        // From the template, the TOC container is:
        // <div id="side-drawer">
        const sideDrawer = document.getElementById('side-drawer');
        
        if (!sideDrawer) {
            console.warn('readerJS: Could not find side drawer with id="side-drawer"');
            return;
        }
        
        console.log('readerJS: Found side drawer, checking for existing TOC');
        
        // Clear out "No Table of Contents found" message if it exists
        const noTocMessage = sideDrawer.querySelector('p');
        if (noTocMessage && noTocMessage.textContent.includes('No Table of Contents found')) {
            noTocMessage.remove();
        }
        
        // Check if TOC entries already exist - looking for links with either format
        const existingTocItems = sideDrawer.querySelectorAll('a[href*="item_index="], a[href*="/read/"]');
        if (existingTocItems.length > 0) {
            console.log(`readerJS: Found ${existingTocItems.length} existing TOC items, preserving them`);
            return;
        }
        
        try {
            const totalChapters = epubWrapper.getTotalChapters();
            console.log(`readerJS: Creating TOC with ${totalChapters} chapters`);
            
            // Validate chapter titles - if empty or invalid, create a default set
            if (!chapterTitles || !Array.isArray(chapterTitles) || chapterTitles.length === 0) {
                console.log('readerJS: No valid chapter titles provided, creating defaults');
                chapterTitles = Array.from({ length: totalChapters }, (_, i) => ({
                    index: i,
                    title: `Chapter ${i + 1}`,
                    href: ''
                }));
            }
            
            // Create TOC links for each chapter
            if (chapterTitles && chapterTitles.length > 0) {
                console.log(`readerJS: Using ${chapterTitles.length} actual chapter titles`);
                
                // Sort by index to ensure proper order
                chapterTitles.sort((a, b) => a.index - b.index);
                
                // Create links with actual titles
                chapterTitles.forEach(chapter => {
                    const a = document.createElement('a');
                    a.textContent = chapter.title || `Chapter ${chapter.index + 1}`;
                    
                    // Use the proper URL format: /read/bookId/index
                    a.href = `/read/${config.bookId}/${chapter.index}`;
                    
                    a.title = chapter.title || `Chapter ${chapter.index + 1}`;
                    
                    // Add appropriate spacing like in the template
                    a.style.display = 'block';
                    a.style.paddingLeft = '32px';
                    a.style.marginBottom = '8px';
                    
                    sideDrawer.appendChild(a);
                });
            } else {
                // Fallback to generic chapter names
                console.log('readerJS: No chapter titles available, using generic names');
                for (let i = 0; i < totalChapters; i++) {
                    const a = document.createElement('a');
                    a.textContent = `Chapter ${i + 1}`;
                    
                    // Use the proper URL format
                    a.href = `/read/${config.bookId}/${i}`;
                    
                    a.title = `Chapter ${i + 1}`;
                    
                    // Add appropriate spacing like in the template
                    a.style.display = 'block';
                    a.style.paddingLeft = '32px';
                    a.style.marginBottom = '8px';
                    
                    sideDrawer.appendChild(a);
                }
            }
            
            console.log('readerJS: TOC links created successfully');
        } catch (error) {
            console.error('readerJS: Error creating TOC content:', error.message);
            
            // Add a message about the error
            const errorMsg = document.createElement('p');
            errorMsg.textContent = `Error creating table of contents: ${error.message}`;
            errorMsg.style.padding = '16px';
            errorMsg.style.color = '#c00';
            sideDrawer.appendChild(errorMsg);
        }
    }


    const initializeReader = async () => {
        console.log('readerJS: dbService is ready. Proceeding with reader initialization.');
        
        // Book ID validation
        const bookId = config.bookId;
        const currentIndex = config.currentIndex;
        
        // Step 1: Get book data from database
        const bookData = await getBookData(bookId);
        if (!bookData) return; // Early exit if can't get book data
            
        // Step 2: Initialize EPUB processor and load book
        const epubWrapper = await loadBookWithProcessor(bookData);
        if (!epubWrapper) return; // Early exit if processor fails
            
        // Step 3: Get and render navigation data
        const totalChapters = await getAndRenderNavData(epubWrapper);
        if (totalChapters <= 0) return; // Early exit if no chapters
            
        await loadAndRenderContent(epubWrapper, bookId, currentIndex, totalChapters);
    };
    
    // === HELPER METHODS ===
    
    // Display error in the viewer element
    function showError(message) {
        console.error(`readerJS: ${message}`);
        viewerElement.innerHTML = `<p>Error: ${message}</p>`;
    }
    
    // Fetch book data from database
    async function getBookData(bookId) {
        try {
            console.log(`readerJS: Fetching book with ID: ${bookId} from IndexedDB...`);
            const bookData = await getBook(bookId);
            
            if (!bookData) {
                throw new Error(`Book with ID ${bookId} not found in local storage.`);
            }
            
            if (!bookData.content || !(bookData.content instanceof Blob)) {
                throw new Error('Invalid book content format in database. Expected Blob or File.');
            }
            
            return bookData;
        } catch (error) {
            console.error(`readerJS: Error fetching book data: ${error.message}`);
            showError(`Could not get book data: ${error.message}`);
            return null;
        }
    }
    
    // Initialize EPUB processor and load book
    async function loadBookWithProcessor(bookData) {
        try {
            console.log('readerJS: Creating EpubProcessorWrapper...');
            
            if (typeof EpubProcessorWrapper === 'undefined') {
                throw new Error("EpubProcessorWrapper is undefined. Check import/export and script loading.");
            }
            
            const bookBinaryContent = await bookData.content.arrayBuffer();
            const epubWrapper = new EpubProcessorWrapper();
            const loadSuccess = await epubWrapper.loadBook(bookBinaryContent);
            
            if (!loadSuccess) {
                throw new Error('Failed to load book with EpubProcessorWrapper.');
            }
            
            return epubWrapper;
        } catch (error) {
            console.error(`readerJS: Error loading book with processor: ${error.message}`);
            showError(`Could not load book content: ${error.message}`);
            return null;
        }
    }
    
    // Get and render navigation data
    async function getAndRenderNavData(epubWrapper) {
        try {
            const totalChapters = epubWrapper.getTotalChapters();
            
            if (totalChapters === 0) {
                throw new Error('No readable content found in the book.');
            }
            
            // Update navigation with total chapter count
            updateNavigationCounts(totalChapters);
            
            // Get chapter titles for TOC rendering
            let chapterTitles = [];
            try {
                // Direct call without unnecessary check - we know the function exists
                chapterTitles = await epubWrapper.getChapterTitles();
                console.log(`readerJS: Retrieved ${chapterTitles.length} chapter titles`);
                
                // Add extra validation
                if (!chapterTitles || !Array.isArray(chapterTitles) || chapterTitles.length === 0) {
                    throw new Error('Invalid or empty chapter titles returned');
                }
            } catch (tocError) {
                console.warn('readerJS: Could not get chapter titles:', tocError.message);
                // Create fallback chapter titles
                console.log('readerJS: Creating fallback chapter titles');
                chapterTitles = Array.from({ length: totalChapters }, (_, i) => ({
                    index: i,
                    title: `Chapter ${i + 1}`,
                    href: ''
                }));
            }
            
            // Check that we have valid chapterTitles before rendering
            if (chapterTitles && chapterTitles.length > 0) {
                console.log(`readerJS: Rendering TOC with ${chapterTitles.length} titles`);
                renderTableOfContents(chapterTitles, epubWrapper);
            } else {
                console.warn('readerJS: No chapter titles available for TOC rendering');
            }
            
            return totalChapters;
        } catch (error) {
            console.error(`readerJS: Error getting navigation data: ${error.message}`);
            showError(`Could not get navigation data: ${error.message}`);
            return 0;
        }
    }
    

    // Load and render chapter content
    async function loadAndRenderContent(epubWrapper, bookId, currentChapterIndex, totalChapters) {
        try {
            console.log(`readerJS: Loading chapter content for index ${currentChapterIndex}...`);
            const chapterHtml = await epubWrapper.getChapterHtml(currentChapterIndex);
            
            if (!chapterHtml) {
                throw new Error(`Failed to get chapter content for index ${currentChapterIndex}`);
            }
            
            // Replace the loading indicator with actual content
            viewerElement.innerHTML = `<div class="chapter-content">${chapterHtml}</div>`;
            console.log('readerJS: Chapter content successfully rendered to page.');
            
            // Trigger success event
            dispatchContentEvent('ebookContentLoaded', {
                bookId, 
                chapterIndex: currentChapterIndex, 
                totalChapters
            });
            
            return true;
        } catch (error) {
            console.error(`readerJS: Error loading chapter content: ${error.message}`);
            viewerElement.innerHTML = `<p>Error loading chapter content: ${error.message}.</p>
                <p>Navigation data has been updated with ${totalChapters} chapters.</p>`;
            
            // Trigger error event but still with navigation data
            dispatchContentEvent('ebookContentError', {
                bookId, 
                chapterIndex: currentChapterIndex, 
                totalChapters, 
                error: error.message
            });
            
            return false;
        }
    }
    
    // Helper to dispatch events
    function dispatchContentEvent(eventName, detail) {
        const event = new CustomEvent(eventName, { detail });
        document.dispatchEvent(event);
    }

    // === INITIALIZATION ===
    
    // Wait for DB service to be ready
    const waitForDbService = async () => {
        console.log("readerJS: Waiting for dbService readiness...");
        try {
            await dbServiceReady;
            console.log("readerJS: dbService is ready.");
            initializeReader();
        } catch (error) {
            console.error('readerJS: Error waiting for dbService:', error);
            showError(`Database service failed to initialize. ${error.message || ''}`);
            throw error;
        }
    };
    
    waitForDbService();

    // Add a debugging function to check raw book ID
    function checkBookId() {
        const bodyDataset = document.body.dataset.bookId;
        const configBookId = config && config.bookId ? config.bookId : 'undefined';
        
        console.log('BookID Debug:');
        console.log('- From body dataset:', bodyDataset);
        console.log('- From config:', configBookId);
        
        // Check for quotes or JSON
        if (bodyDataset && (bodyDataset.startsWith('"') || bodyDataset.startsWith("'"))) {
            console.log('- Body dataset has quotes! Need to parse JSON');
            try {
                const parsed = JSON.parse(bodyDataset);
                console.log('- Parsed JSON:', parsed);
                document.body.dataset.bookId = parsed; // Fix it
            } catch (e) {
                console.error('- Failed to parse JSON:', e);
            }
        }
        
        // Check for quotes or JSON in config
        if (typeof configBookId === 'string' && (configBookId.startsWith('"') || configBookId.startsWith("'"))) {
            console.log('- Config has quotes! Need to parse JSON');
            try {
                const parsed = JSON.parse(configBookId);
                console.log('- Parsed JSON:', parsed);
                config.bookId = parsed; // Fix it
            } catch (e) {
                console.error('- Failed to parse JSON:', e);
            }
        }
        
        return document.body.dataset.bookId;
    }
}); 
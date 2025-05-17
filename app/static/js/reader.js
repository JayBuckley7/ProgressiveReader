import { ready as dbServiceReady, getBook, getProgress, saveProgress, updateLastOpened } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';
import { TextProcessorWrapper } from './textProcessor.js';


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
    let epubWrapperInstance = null; // Declare epubWrapperInstance here
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
        const currentIndex = config.currentIndex; // This is 0-based from config
        const pageTotal = config.pageCount || totalChapters;
        
        // Target the specific span for page count
        document.querySelectorAll('.navigation .nav-right span[data-role="page-counter"]').forEach(span => {
            const oldText = span.textContent;
            // Display 1-based indexing for user-friendliness (e.g., Page 1 of N)
            // totalChapters is the count, so last page is totalChapters - 1 (0-indexed)
            const newText = `Page ${currentIndex + 1} of ${pageTotal}`;
            span.textContent = newText;
            // Store 0-based current_index and 1-based total_items if needed, but textContent is primary for display
            span.dataset.currentIndex = currentIndex; // Store 0-based index
            span.dataset.totalItems = totalChapters;    // Store total count
            console.log(`readerJS: Updated navigation counter from "${oldText}" to "${newText}"`);
        });
        // update the prev and next buttons - This was causing a loop, should be called separately
        // updatePrevNextButtons(totalChapters); 
        // console.log(`readerJS: Updated navigation elements with total: ${totalChapters}`); // Redundant log line
    }

    function updatePrevNextButtons(totalChapters) {
        const currentIndex = Number(config.currentIndex) || 0; // 0-based
        const bookId = config.bookId;
        const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${bookId}` : `/read/${bookId}`;
        const pageTotal = config.pageCount || totalChapters;
    
        document.querySelectorAll('.navigation').forEach(nav => {
            const navRight = nav.querySelector('.nav-right');
            if (!navRight) return;
    
            navRight.innerHTML = ''; // Clear existing content
    
            // -- Previous Button/Link --
            if (currentIndex > 0) {
                const aPrev = document.createElement('a');
                aPrev.textContent = 'Previous';
                aPrev.href = `${baseUrl}/${currentIndex - 1}`;
                aPrev.dataset.nav = 'prev';
                aPrev.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigate(-1);
                });
                navRight.appendChild(aPrev);
            } else {
                const btnPrev = document.createElement('button');
                btnPrev.type = 'button';
                btnPrev.className = 'disabled-nav-btn'; // Use class from navigation.html
                btnPrev.disabled = true;
                btnPrev.textContent = 'Previous';
                navRight.appendChild(btnPrev);
            }
    
            // -- Page Count Span --
            const pageCountSpan = document.createElement('span');
            pageCountSpan.dataset.role = 'page-counter';
            // Initial text will be updated by updateNavigationCounts, but set a placeholder
            pageCountSpan.textContent = `Page ${currentIndex + 1} of ${pageTotal}`;
            pageCountSpan.style.margin = '0 0.8em'; // Add some spacing
            navRight.appendChild(pageCountSpan);
    
            // -- Next Button/Link --
            // totalChapters is the count, so last valid index is totalChapters - 1
            if (currentIndex < totalChapters - 1) {
                const aNext = document.createElement('a');
                aNext.textContent = 'Next';
                aNext.href = `${baseUrl}/${currentIndex + 1}`;
                aNext.dataset.nav = 'next';
                aNext.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigate(1);
                });
                navRight.appendChild(aNext);
            } else {
                const btnNext = document.createElement('button');
                btnNext.type = 'button';
                btnNext.className = 'disabled-nav-btn'; // Use class from navigation.html
                btnNext.disabled = true;
                btnNext.textContent = 'Next';
                navRight.appendChild(btnNext);
            }
        });
        // Call updateNavigationCounts separately after DOM for page counter is established
        updateNavigationCounts(totalChapters); 
    }

    // Handle TOC rendering for the side drawer
    function renderTableOfContents(chapterTitles, epubWrapper) {
        // From the template, the TOC container is:
        // <div id="side-drawer">
        const sideDrawer = document.getElementById('side-drawer');
        const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${config.bookId}` : `/read/${config.bookId}`;
        
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
                    
                    // Use the proper URL format: /read/bookId/index or /demo/read/bookId/index
                    a.href = `${baseUrl}/${chapter.index}`;
                    
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
                    a.href = `${baseUrl}/${i}`;
                    
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
        if (bookData.fileType) config.fileType = bookData.fileType;
        if (bookData.pageCount) config.pageCount = bookData.pageCount;
            
        // Step 2: Initialize EPUB processor and load book
        epubWrapperInstance = await loadBookWithProcessor(bookData); // Assign to shared instance
        if (!epubWrapperInstance) return; // Early exit if processor fails
            
        // Step 3: Get and render navigation data
        const totalChapters = await getAndRenderNavData(epubWrapperInstance); // Pass instance
        if (totalChapters <= 0) return; // Early exit if no chapters
            
        await loadAndRenderContent(epubWrapperInstance, bookId, currentIndex, totalChapters); // Pass instance
    };
    
    // === HELPER METHODS ===
    
    // Display error in the viewer element
    function showError(message) {
        console.error(`readerJS: ${message}`);
        viewerElement.innerHTML = `<p>Error: ${message}</p>`;
    }
    
    // Fetch book data from database
    async function getBookData(bookId) {
        if (window.IS_DEMO_MODE && typeof window.getDemoBookFile === 'function') {
            console.log(`readerJS: Demo mode active. Attempting to load demo book ID: ${bookId} from static file.`);
            const demoBookData = await window.getDemoBookFile(bookId);
            if (demoBookData) {
                console.log(`readerJS: Successfully fetched demo book data for ${bookId} from static file.`);
                // Ensure the content is a Blob, which loadBookWithProcessor expects
                if (!(demoBookData.content instanceof Blob)) {
                    showError(`Demo book data for ${bookId} is not in the expected Blob format.`);
                    return null;
                }
                return demoBookData; // This object should have a `content` property (Blob)
            }
            console.log(`readerJS: Demo book ID ${bookId} not found by getDemoBookFile or not in demo mode. Falling back to IndexedDB.`);
        }

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
            const bookBinaryContent = await bookData.content.arrayBuffer();
            let wrapper;
            if (bookData.fileType === 'txt' || bookData.fileType === 'docx') {
                wrapper = new TextProcessorWrapper();
                const loaded = await wrapper.loadBook(bookBinaryContent, { fileType: bookData.fileType });
                if (!loaded) {
                    throw new Error('Failed to load book with TextProcessorWrapper.');
                }
            } else {
                wrapper = new EpubProcessorWrapper();
                const loaded = await wrapper.loadBook(bookBinaryContent);
                if (!loaded) {
                    throw new Error('Failed to load book with EpubProcessorWrapper.');
                }
            }

            return wrapper;
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
            config.totalChapters = totalChapters; // Store totalChapters in config
            if (typeof epubWrapper.getPageCount === 'function') {
                const pc = epubWrapper.getPageCount();
                if (pc) config.pageCount = pc;
            }
            
            if (totalChapters === 0) {
                throw new Error('No readable content found in the book.');
            }
            
            // Update navigation with total chapter count
            updatePrevNextButtons(totalChapters); // This function will now also call updateNavigationCounts
            
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

    // --- Swipe Controls ---
    // let touchstartX = 0;
    // let touchendX = 0;
    // let touchstartY = 0;
    // let touchendY = 0;
    // const swipeThreshold = 50; // Minimum distance for a swipe
    // const swipeMaxVertical = 75; // Maximum vertical travel for a horizontal swipe

    const contentWrapper = document.querySelector('.content-wrapper') || document.body;

    // New pointer event based swipe logic
    let startX, startY, downTime, isSwiping = false;
    const minLock = 10;       // px before we "lock" direction
    const minSwipe = 60;      // px before we treat it as a page swipe
    const minVelocity = 0.3;  // px/ms

    // function handleGesture() {
    //     const swipeLength = touchendX - touchstartX;
    //     const verticalSwipeLength = Math.abs(touchendY - touchstartY);

    //     if (verticalSwipeLength > swipeMaxVertical) {
    //         console.log('Swipe discarded: too much vertical movement.');
    //         return;
    //     }

    //     // We only care about horizontal swipes beyond the threshold
    //     if (Math.abs(swipeLength) > swipeThreshold) {
    //         const currentIndex = Number(config.currentIndex) || 0;
    //         const navSpan = document.querySelector('.navigation span[data-total-items]');
    //         const totalChapters = navSpan ? parseInt(navSpan.dataset.totalItems, 10) : 0;

    //         if (totalChapters === 0) {
    //             console.warn("Swipe: Total chapters not available or zero.");
    //             return;
    //         }

    //         const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${config.bookId}` : `/read/${config.bookId}`;

    //         if (swipeLength < 0) { // Negative swipeLength: Finger pulled from Right to Left (e.g., right edge to center)
    //             // ACTION: Go to NEXT page
    //             if (currentIndex < totalChapters - 1) {
    //                 console.log('Swipe R->L (Next Page)');
    //                 window.location.href = `${baseUrl}/${currentIndex + 1}`;
    //             } else {
    //                 console.log('Swipe R->L: Already on the last page.');
    //             }
    //         } else if (swipeLength > 0) { // Positive swipeLength: Finger pulled from Left to Right (e.g., left edge to center)
    //             // ACTION: Go to PREVIOUS page
    //             if (currentIndex > 0) {
    //                 console.log('Swipe L->R (Previous Page)');
    //                 window.location.href = `${baseUrl}/${currentIndex - 1}`;
    //             } else {
    //                 console.log('Swipe L->R: Already on the first page.');
    //             }
    //         }
    //     }
    // }

    // contentWrapper.addEventListener('touchstart', e => {
    //     touchstartX = e.changedTouches[0].screenX;
    //     touchstartY = e.changedTouches[0].screenY;
    // }, { passive: true }); // Use passive for scroll performance if not preventing default

    // contentWrapper.addEventListener('touchend', e => {
    //     touchendX = e.changedTouches[0].screenX;
    //     touchendY = e.changedTouches[0].screenY;
    //     // It's important to check if the event target is not an interactive element
    //     // to avoid hijacking clicks on buttons, links, or input fields within the content.
    //     const interactiveElements = ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'];
    //     if (e.target && interactiveElements.includes(e.target.tagName)) {
    //         console.log('Swipe ignored: touch ended on an interactive element.');
    //         return;
    //     }
    //     handleGesture();
    // }, { passive: true }); // Use passive for scroll performance if not preventing default

    contentWrapper.addEventListener('pointerdown', e =>{
      if(e.pointerType !== 'touch') return;
      // Guard interactive elements
      if(e.target.closest('a, button, input, textarea, select')) {
        console.log('Swipe ignored: pointer down on an interactive element.');
        return;
      }
      ({ clientX:startX, clientY:startY } = e);
      downTime = e.timeStamp; // For velocity calculation later
      isSwiping = false;
      // Potentially prevent text selection during swipe attempt
      // e.preventDefault(); // Re-evaluate if this is needed or causes issues
    });

    contentWrapper.addEventListener('pointermove', e =>{
      if(e.pointerType !== 'touch' || startX == null) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if(!isSwiping){ // Only check for lock if not already swiping
        if(Math.abs(dx) > minLock && Math.abs(dx) > Math.abs(dy)){ // Horizontal gesture
          isSwiping = true;          // Lock horizontal gesture
          // Prevent default only when we are sure it's a swipe, to allow vertical scroll otherwise
          if (e.cancelable) e.preventDefault(); // Check if event is cancelable
        } else if (Math.abs(dy) > minLock) { // Vertical gesture, ensure we don't lock
          startX = null; // Reset to allow scrolling
          startY = null;
          // Do not set isSwiping = true
        }
        // If neither dx nor dy is greater than minLock, do nothing yet
      } else { // Already swiping (horizontally locked)
         if (e.cancelable) e.preventDefault(); // Continue preventing default for the locked swipe
      }
    });

    contentWrapper.addEventListener('pointerup', e =>{
      if(e.pointerType !== 'touch' || startX == null || !isSwiping) { // Ensure it was a swipe attempt
        startX = null; // Reset startX here for all cases after pointerup
        startY = null;
        isSwiping = false; // Reset swiping state
        return;
      }

      const dx = e.clientX - startX;
      const dt = e.timeStamp - downTime;
      const v = (dt > 0) ? Math.abs(dx) / dt : 0; // Avoid division by zero if timeStamp is the same

      if(Math.abs(dx) > minSwipe && v > minVelocity){
        const currentIndex = Number(config.currentIndex) || 0;
        const navSpan = document.querySelector('.navigation span[data-total-items]');
        const totalChapters = navSpan ? parseInt(navSpan.dataset.totalItems, 10) : (config.totalChapters || 0);

        if (totalChapters === 0) {
            console.warn("Swipe: Total chapters not available or zero.");
            startX = startY = null; // Reset
            isSwiping = false;
            return;
        }

        // const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${config.bookId}` : `/read/${config.bookId}`;
        if (dx < 0) {
            if (currentIndex < totalChapters - 1) {
                console.log('Swipe R->L (Next Page) via Pointer - calling navigate(+1)');
                navigate(+1);
                // window.location.href = `${baseUrl}/${currentIndex + 1}`;
            } else {
                console.log('Swipe R->L: Already on the last page.');
            }
        } else {
            if (currentIndex > 0) {
                console.log('Swipe L->R (Previous Page) via Pointer - calling navigate(-1)');
                navigate(-1);
                // window.location.href = `${baseUrl}/${currentIndex - 1}`;
            } else {
                console.log('Swipe L->R: Already on the first page.');
            }
        }
      }
      startX = startY = null; // Reset coordinates
      isSwiping = false; // Reset swiping state
    });


    // --- Smart Translate Button Logic ---
    const smartTranslateButton = document.getElementById('smart-translate-btn');
    if (smartTranslateButton) {
        smartTranslateButton.addEventListener('click', () => {
            if (window.translationManager && typeof window.translationManager.triggerTranslation === 'function') {
                const lastMethod = localStorage.getItem('lastTranslationMethod') || 'standard'; // Default to standard
                console.log(`Smart translate called with method: ${lastMethod}`);
                window.translationManager.triggerTranslation(lastMethod);
            } else {
                console.error('Smart translate: translationManager.triggerTranslation is not available.');
                alert('Translate function is not available at the moment.');
            }
        });
    }

    // New navigate function for partial updates
    async function navigate(delta) {
        const newIndex = Number(config.currentIndex) + delta;
        const bookId = config.bookId;
        const totalChapters = config.totalChapters; // Assuming totalChapters is stored in config

        if (!epubWrapperInstance) { // Check if epubWrapperInstance is initialized
            console.error("navigate: epubWrapperInstance is not initialized.");
            showError("Reader not fully initialized. Please try refreshing.");
            return;
        }

        // Boundary checks for newIndex
        if (newIndex < 0 || newIndex >= totalChapters) {
            console.warn(`navigate: Attempted to navigate to invalid index ${newIndex}. Total chapters: ${totalChapters}.`);
            return;
        }

        try {
            console.log(`navigate: Loading content for index ${newIndex} for book ${bookId}`);
            
            const contentLoaded = await loadAndRenderContent(epubWrapperInstance, bookId, newIndex, totalChapters);

            if (contentLoaded) {
                const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${bookId}` : `/read/${bookId}`;
                const url = `${baseUrl}/${newIndex}`;
                history.pushState({ idx: newIndex, bookId: bookId }, '', url);
                config.currentIndex = newIndex; 
                updatePrevNextButtons(totalChapters); // This function now updates counts too
                
                viewerElement.scrollTop = 0;
                document.documentElement.scrollTop = 0;
                console.log(`navigate: Successfully navigated to index ${newIndex}`);
            } else {
                console.error(`navigate: loadAndRenderContent failed for index ${newIndex}.`);
                viewerElement.innerHTML = `<p>Error loading content for chapter ${newIndex + 1}. Please try refreshing.</p>`;
            }

        } catch (error) {
            console.error('Error during navigate function execution:', error);
            viewerElement.innerHTML = `<p>Error navigating to chapter: ${error.message}. Please try refreshing.</p>`;
        }
    }

}); 
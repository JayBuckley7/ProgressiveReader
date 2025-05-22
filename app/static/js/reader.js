import { ready as dbServiceReady, getBook, getProgress, saveProgress, updateLastOpened } from './dbService.js';
import { EpubProcessorWrapper } from './epubProcessor.js';
import { TextProcessorWrapper } from './textProcessor.js';

// Module-scoped variables
let config = {};
let epubWrapperInstance = null;
let viewerElement = null; // Will be assigned in DOMContentLoaded

// === TOP-LEVEL HELPER FUNCTIONS ===

function showError(message) {
    console.error(`readerJS: Error: ${message}`);
    if (viewerElement) { // Relies on viewerElement being set by DOMContentLoaded
        viewerElement.innerHTML = `<p class="error-message">Error: ${message}</p>`;
    } else {
        console.error("readerJS.showError: viewerElement is null. Error cannot be displayed in UI.");
        // Fallback alert if viewerElement isn't available for some reason
        alert(`Reader Error: ${message}`);
    }
}

function updateNavigationCounts(totalChapters) {
    // Uses module-scoped 'config'
    const currentIndex = config.currentIndex; // This should be a number
    document.querySelectorAll('.navigation .nav-right span[data-role="page-counter"]').forEach(span => {
        span.textContent = `Page ${Number(currentIndex) + 1} of ${totalChapters}`;
        span.dataset.currentIndex = currentIndex;
        span.dataset.totalItems = totalChapters;
    });
}

// Note: 'navigate' is defined further down but is called by event listeners here.
// This is fine due to function hoisting for 'function' declarations.
function updatePrevNextButtons(totalChapters) {
    // Uses module-scoped 'config' and calls 'navigate'
    const currentIndex = Number(config.currentIndex) || 0;
    const bookId = config.bookId;
    const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${bookId}` : `/read/${bookId}`;
    
    document.querySelectorAll('.navigation').forEach(nav => {
        const navRight = nav.querySelector('.nav-right');
        if (!navRight) {
            console.warn("updatePrevNextButtons: .nav-right element not found in a .navigation parent.");
            return;
        }
        navRight.innerHTML = ''; // Clear existing buttons/text

        // Previous Button
        if (currentIndex > 0) {
            const a = document.createElement('a');
            a.textContent = 'Previous';
            a.href = `${baseUrl}/${currentIndex - 1}`;
            a.dataset.nav = 'prev';
            a.addEventListener('click', (e) => { e.preventDefault(); navigate(-1); });
            navRight.appendChild(a);
        } else {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'disabled-nav-btn';
            btn.disabled = true;
            btn.textContent = 'Previous';
            navRight.appendChild(btn);
        }

        // Page Count Span
        const span = document.createElement('span');
        span.dataset.role = 'page-counter';
        // Initial text set here, will be updated by updateNavigationCounts if totalChapters is valid
        span.textContent = `Page ${currentIndex + 1} of ${totalChapters > 0 ? totalChapters : '...'}`;
        span.style.margin = '0 0.8em';
        navRight.appendChild(span);

        // Next Button
        if (currentIndex < totalChapters - 1) {
            const a = document.createElement('a');
            a.textContent = 'Next';
            a.href = `${baseUrl}/${currentIndex + 1}`;
            a.dataset.nav = 'next';
            a.addEventListener('click', (e) => { e.preventDefault(); navigate(1); });
            navRight.appendChild(a);
        } else {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'disabled-nav-btn';
            btn.disabled = true;
            btn.textContent = 'Next';
            navRight.appendChild(btn);
        }
    });
    // Explicitly update counts if we have a valid totalChapters
    if (totalChapters > 0) {
        updateNavigationCounts(totalChapters);
    }
}

function renderTableOfContents(chapterTitles, epubWrapper) {
    // Uses module-scoped 'config'
    const sideDrawer = document.getElementById('side-drawer');
    if (!sideDrawer) { console.warn('readerJS: side-drawer not found for TOC'); return; }
    
    const baseUrl = config.bookId ? 
                    (window.IS_DEMO_MODE ? `/demo/read/${config.bookId}` : `/read/${config.bookId}`)
                    : '';
    if (!baseUrl) {
        console.error("renderTableOfContents: bookId is missing from config. Cannot generate TOC links.");
        sideDrawer.innerHTML = '<p>Error: Book ID missing, cannot load Table of Contents.</p>';
        return;
    }
    
    sideDrawer.innerHTML = ''; // Clear previous TOC before rendering new one

    try {
        const totalChapters = epubWrapper.getTotalChapters();
        if (!chapterTitles || !Array.isArray(chapterTitles) || chapterTitles.length === 0) {
//             console.log('readerJS: No valid chapter titles for TOC, creating defaults.');
            chapterTitles = Array.from({ length: totalChapters }, (_, i) => ({ index: i, title: `Chapter ${i + 1}` }));
        }
        
        chapterTitles.sort((a, b) => a.index - b.index).forEach(chapter => {
            const a = document.createElement('a');
            a.textContent = chapter.title || `Chapter ${chapter.index + 1}`;
            // Ensure chapter.index is a valid number for the URL
            if (typeof chapter.index !== 'number') {
                console.warn(`Invalid chapter index for TOC item: ${chapter.title}`, chapter.index);
                return; // Skip this item
            }
            a.href = `${baseUrl}/${chapter.index}`;
            a.title = chapter.title || `Chapter ${chapter.index + 1}`;
            a.style.display = 'block'; 
            a.style.paddingLeft = '32px'; 
            a.style.marginBottom = '8px';
            sideDrawer.appendChild(a);
        });
    } catch (error) {
        console.error('readerJS: Error creating TOC content:', error.message, error.stack);
        const p = document.createElement('p'); 
        p.textContent = 'Error loading Table of Contents.'; 
        p.style.padding = '16px'; 
        p.style.color = '#c00';
        sideDrawer.appendChild(p);
    }
}

async function getBookData(bookId) {
    // Uses 'showError'
    if (!bookId) {
        showError("getBookData: No bookId provided.");
        return null;
    }
    if (window.IS_DEMO_MODE && typeof window.getDemoBookFile === 'function') {
//         console.log(`readerJS: Demo mode. Attempting to load demo book: ${bookId}`);
        const demoBookData = await window.getDemoBookFile(bookId);
        if (demoBookData) {
            if (!(demoBookData.content instanceof Blob)) { 
                showError(`Demo book data for ${bookId} is not a Blob.`); 
                return null; 
            }
//             console.log(`readerJS: Successfully fetched demo book data for ${bookId}`);
            return demoBookData;
        }
//         console.log(`readerJS: Demo book ${bookId} not found by getDemoBookFile. Will try IndexedDB if applicable.`);
    }
    try {
//         console.log(`readerJS: Fetching book with ID: ${bookId} from IndexedDB...`);
        const bookData = await getBook(bookId); // From dbService.js
        if (!bookData) { 
            throw new Error(`Book with ID ${bookId} not found in local storage.`); 
        }
        if (!bookData.content || !(bookData.content instanceof Blob)) {
            throw new Error('Invalid book content format in database. Expected Blob.');
        }
//         console.log(`readerJS: Successfully fetched book data for ${bookId} from IndexedDB.`);
        return bookData;
    } catch (error) { 
        showError(`Could not get book data for ${bookId}: ${error.message}`); 
        console.error(error.stack);
        return null; 
    }
}

async function loadBookWithProcessor(bookData) {
    // Uses 'showError'
    if (!bookData || !bookData.content) {
        showError("loadBookWithProcessor: Invalid bookData provided.");
        return null;
    }
    try {
        const bookBinaryContent = await bookData.content.arrayBuffer();
        let wrapper;
        if (bookData.fileType === 'txt' || bookData.fileType === 'docx' || bookData.fileType === 'pdf') {
            wrapper = new TextProcessorWrapper();
        } else { // Default to EPUB
            wrapper = new EpubProcessorWrapper(); 
        }
        // Pass fileType explicitly for TextProcessorWrapper, EpubProcessorWrapper ignores it
        const loaded = await wrapper.loadBook(bookBinaryContent, { fileType: bookData.fileType }); 
        if (!loaded) { 
            throw new Error(`Failed to load book using ${wrapper.constructor.name}.`); 
        }
//         console.log(`readerJS: Book loaded with ${wrapper.constructor.name}.`);
        return wrapper;
    } catch (error) { 
        showError(`Could not load book content: ${error.message}`); 
        console.error(error.stack);
        return null; 
    }
}

async function getAndRenderNavData(epubWrapper) {
    // Uses module-scoped 'config', 'showError', 'updatePrevNextButtons', 'renderTableOfContents'
    if (!epubWrapper) {
        showError("getAndRenderNavData: epubWrapper is not available.");
        return 0;
    }
    try {
        const totalChapters = epubWrapper.getTotalChapters();
        config.totalChapters = totalChapters; // Store in module-scoped config
        
        if (totalChapters === 0) { 
            // This might be normal for very short texts, or an error.
            console.warn('readerJS: Book has 0 chapters according to processor.');
            // Still update nav buttons to show "Page 1 of 0" or similar if desired, or handle as error.
            // For now, let's assume 0 chapters means nothing to navigate.
            updatePrevNextButtons(0); // Will show disabled buttons and "Page 1 of 0"
            renderTableOfContents([], epubWrapper); // Render empty TOC or "No content" message
            return 0; // Indicate no chapters to navigate
        }
        
        updatePrevNextButtons(totalChapters);

        let chapterTitles = [];
        try {
            chapterTitles = await epubWrapper.getChapterTitles();
            if (!chapterTitles || !Array.isArray(chapterTitles)) {
                console.warn('readerJS: Invalid chapter titles format returned, using defaults.');
                chapterTitles = []; 
            }
        } catch (tocError) { 
            console.warn('readerJS: Could not get chapter titles due to error:', tocError.message, ". Using default titles.");
            chapterTitles = []; 
        }
        renderTableOfContents(chapterTitles, epubWrapper);
        return totalChapters;
    } catch (error) { 
        showError(`Could not get navigation data: ${error.message}`); 
        console.error(error.stack);
        return 0; 
    }
}

function dispatchContentEvent(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

async function loadAndRenderContent(epubWrapper, bookId, chapterIndex, totalChapters) {
    // Uses module-scoped 'viewerElement', 'showError', 'dispatchContentEvent'
    if (!viewerElement) { 
        showError("Content viewer element not found (loadAndRenderContent function)."); 
        return false; 
    }
    if (!epubWrapper) {
        showError("EPUB wrapper not available in loadAndRenderContent.");
        return false;
    }
    try {
//         console.log(`readerJS: Loading chapter ${chapterIndex} for book ${bookId}`);
        const chapterHtml = await epubWrapper.getChapterHtml(chapterIndex);
        if (chapterHtml === null || typeof chapterHtml === 'undefined') { 
            throw new Error(`Content for chapter ${chapterIndex} is null or undefined.`); 
        }
        viewerElement.innerHTML = `<div class="chapter-content">${chapterHtml}</div>`;
//         console.log(`readerJS: Chapter ${chapterIndex} rendered successfully.`);
        dispatchContentEvent('ebookContentLoaded', { bookId, chapterIndex, totalChapters });
        return true;
    } catch (error) {
        showError(`Error loading content for chapter ${chapterIndex}: ${error.message}`);
        console.error(error.stack);
        dispatchContentEvent('ebookContentError', { bookId, chapterIndex, totalChapters, error: error.message });
        return false;
    }
}

async function navigate(delta) {
    // Uses module-scoped 'config', 'epubWrapperInstance', 'viewerElement', 'showError', 
    // 'loadAndRenderContent', 'updatePrevNextButtons'
    if (!epubWrapperInstance || typeof config.totalChapters !== 'number') { 
        showError("Reader not fully initialized for navigation. Missing wrapper or total chapters."); 
        return; 
    }
    
    const newIndex = Number(config.currentIndex) + delta;
    const bookId = config.bookId;
    const totalChapters = config.totalChapters;

    if (newIndex < 0 || newIndex >= totalChapters) { 
        console.warn(`Navigate: Attempted to navigate to invalid index ${newIndex}. Current: ${config.currentIndex}, Total: ${totalChapters}`); 
        return; 
    }

//     console.log(`navigate: Attempting to load index ${newIndex}`);
    const contentLoaded = await loadAndRenderContent(epubWrapperInstance, bookId, newIndex, totalChapters);
    if (contentLoaded) {
        const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${bookId}` : `/read/${bookId}`;
        const url = `${baseUrl}/${newIndex}`;
        history.pushState({ idx: newIndex, bookId: bookId }, '', url); // Use pushState for back/forward
        config.currentIndex = newIndex; // Update module-scoped config
        
        if (window.storageManager && typeof window.storageManager.saveReadingProgress === 'function') {
            window.storageManager.saveReadingProgress(bookId, newIndex);
        }
        updatePrevNextButtons(totalChapters); // Update nav display
        
        if(viewerElement) viewerElement.scrollTop = 0; 
        document.documentElement.scrollTop = 0; 
//         console.log(`navigate: Successfully navigated to index ${newIndex}. URL: ${url}`);
    } else {
        console.error(`navigate: Failed to load content for index ${newIndex}. Error should have been shown by loadAndRenderContent.`);
    }
}

export async function initializeReader(initialConfig) {
//     console.log('readerJS: initializeReader called with config:', JSON.stringify(initialConfig));
    config = initialConfig; // Set module-scoped config

    if (!viewerElement) {
        console.warn("readerJS.initializeReader: viewerElement was not set by DOMContentLoaded. Attempting to query now.");
        viewerElement = document.querySelector('.epub-content'); 
        if (!viewerElement) {
             console.error("readerJS.initializeReader: CRITICAL .epub-content viewer element not found. Cannot proceed.");
             alert("FATAL ERROR: Reader display area missing. Please refresh or contact support.");
             return; 
        }
    }
    
    const { bookId, currentIndex } = config;
    if (!bookId || typeof currentIndex !== 'number') {
        showError("Book ID or current page index is missing or invalid in the configuration. Cannot load book."); 
        return;
    }

//     console.log(`readerJS: Initializing reader for bookId: ${bookId}, starting at currentIndex: ${currentIndex}`);

    const bookData = await getBookData(bookId);
    if (!bookData) { 
        // showError is called by getBookData
        console.error(`initializeReader: Failed to get book data for ${bookId}.`);
        return;
    }
        
    epubWrapperInstance = await loadBookWithProcessor(bookData); // Set module-scoped instance
    if (!epubWrapperInstance) {
        // showError is called by loadBookWithProcessor
        console.error(`initializeReader: Failed to load book processor for ${bookId}.`);
        return;
    }
        
    const totalChapters = await getAndRenderNavData(epubWrapperInstance);
    // getAndRenderNavData shows error if totalChapters is 0 or less due to an issue.
    // If totalChapters is legitimately 0 (e.g. empty book), it will handle UI appropriately.
    // No specific error check needed here for totalChapters <= 0 unless specific behavior desired.
//     console.log(`initializeReader: Total chapters determined: ${totalChapters}`);
        
    const initialContentRendered = await loadAndRenderContent(epubWrapperInstance, bookId, currentIndex, totalChapters);

    if (initialContentRendered) {
//         console.log(`readerJS: Initial content for chapter ${currentIndex} rendered successfully.`);
        const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${bookId}` : `/read/${bookId}`;
        const expectedUrl = `${baseUrl}/${currentIndex}`;
        // Only update URL if it's different, to avoid redundant history entries if already correct.
        if (window.location.pathname !== expectedUrl) {
             history.replaceState({ idx: currentIndex, bookId: bookId }, '', expectedUrl);
//              console.log(`readerJS: Initial URL updated to: ${expectedUrl}`);
        } else {
//             console.log(`readerJS: URL ${window.location.pathname} already matches expected ${expectedUrl}. No replaceState needed.`);
        }
    } else {
        console.error(`readerJS: Initial content rendering FAILED for chapter ${currentIndex}. Check logs.`);
        // showError would have been called by loadAndRenderContent
    }
}

// === DOMContentLoaded SPECIFIC INITIALIZATIONS ===
// This listener should remain at the end of the file.
document.addEventListener('DOMContentLoaded', () => {
    // CRITICAL FIRST STEP: Assign module-scoped viewerElement
    viewerElement = document.querySelector('.epub-content');
//     console.log('readerJS: DOMContentLoaded. viewerElement assigned:', viewerElement ? 'found' : 'NOT FOUND');
    
    const configElement = document.getElementById('page-config'); 

    if (!viewerElement) {
        console.error("readerJS DOMContentLoaded: Critical .epub-content viewer element NOT FOUND. Reader cannot function.");
        document.body.insertAdjacentHTML('afterbegin', '<p style="background:red; color:white; padding:1em; text-align:center; position:fixed; top:0; left:0; right:0; z-index:9999;">FATAL ERROR: Reader content area missing. Please refresh.</p>');
        return; 
    }
    // configElement is used by readerInit.js to pass data to initializeReader.
    // reader.js itself doesn't parse it directly anymore.
    // Not fatal if missing here, but readerInit will fail to pass config.
    if (!configElement) {
        // This error will be visible in the (hopefully existing) viewerElement.
        showError("Page configuration element (#page-config) missing. Reader may not load correctly.");
    }
    
    // Debug click handlers (optional, can be removed for production)
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-nav]');
        if (target) {
//             console.log(`Click detected on navigation element: ${target.dataset.nav}`);
        }
    }, true);

    // Wait for DB service to be ready.
    // initializeReader (called by readerInit.js) might depend on this.
    dbServiceReady
        .then(() => {
//             console.log("readerJS: dbService is ready.");
        })
        .catch(error => {
            showError(`Database service failed to initialize: ${error.message || 'Unknown DB error'}`);
            console.error('readerJS: Critical error waiting for dbService:', error.stack);
        });

    // --- Swipe Controls ---
    const contentWrapper = document.querySelector('.content-wrapper') || document.body;
    let startX_swipe, startY_swipe, downTime_swipe, isSwiping_swipe = false;
    const minLock_swipe = 10;      
    const minSwipe_swipe = 60;     
    const minVelocity_swipe = 0.3; 

    contentWrapper.addEventListener('pointerdown', e =>{
      if(e.pointerType !== 'touch') return;
      if(e.target.closest('a, button, input, textarea, select, [contenteditable="true"]')) {
//         console.log('Swipe ignored: pointer down on an interactive or editable element.');
        return;
      }
      startX_swipe = e.clientX;
      startY_swipe = e.clientY;
      downTime_swipe = e.timeStamp; 
      isSwiping_swipe = false;
//       // console.log('Swipe: pointerdown');
    });

    contentWrapper.addEventListener('pointermove', e =>{
      if(e.pointerType !== 'touch' || startX_swipe == null) return;

      const dx = e.clientX - startX_swipe;
      const dy = e.clientY - startY_swipe;

      if(!isSwiping_swipe){ 
        if(Math.abs(dx) > minLock_swipe && Math.abs(dx) > Math.abs(dy)){ 
          isSwiping_swipe = true;          
//           // console.log('Swipe: Horizontal lock acquired');
          if (e.cancelable) e.preventDefault(); 
        } else if (Math.abs(dy) > minLock_swipe && Math.abs(dy) > Math.abs(dx)) { 
//           // console.log('Swipe: Vertical scroll detected, aborting horizontal swipe');
          startX_swipe = null; 
          startY_swipe = null;
        }
      } else { 
         if (e.cancelable) e.preventDefault(); 
      }
    });

    contentWrapper.addEventListener('pointerup', e => {
      if (e.pointerType !== 'touch' || startX_swipe == null || !isSwiping_swipe) {
//         // console.log('Swipe: pointerup - not a valid swipe.');
        startX_swipe = null; 
        startY_swipe = null;
        isSwiping_swipe = false; 
        return;
      }

      const dx = e.clientX - startX_swipe;
      const dt = e.timeStamp - downTime_swipe;
      const v = (dt > 0) ? Math.abs(dx) / dt : 0; 

//       // console.log(`Swipe: pointerup. dx: ${dx}, dt: ${dt}, v: ${v}`);

      if (Math.abs(dx) > minSwipe_swipe && v > minVelocity_swipe) {
        if (!config || typeof config.currentIndex !== 'number' || typeof config.totalChapters !== 'number') {
            console.warn("Swipe: Config not ready for navigation or invalid. Config:", JSON.stringify(config));
        } else {
//             console.log(`Swipe: Gesture detected. dx: ${dx}. Calling navigate.`);
            navigate(dx < 0 ? 1 : -1); // navigate(1) for next (swipe left), navigate(-1) for prev (swipe right)
        }
      } else {
//         // console.log('Swipe: Gesture did not meet threshold (minSwipe or minVelocity).');
      }
      startX_swipe = startY_swipe = null; 
      isSwiping_swipe = false; 
    });

    // --- Smart Translate Button Logic ---
    const smartTranslateButton = document.getElementById('smart-translate-btn');
    if (smartTranslateButton) {
        smartTranslateButton.addEventListener('click', () => {
            if (window.translationManager && typeof window.translationManager.triggerTranslation === 'function') {
                const lastMethod = localStorage.getItem('lastTranslationMethod') || 'standard';
//                 console.log(`Smart translate button clicked. Method: ${lastMethod}`);
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

        if (window.ttsManager && typeof window.ttsManager.stopSpeaking === 'function') {
            window.ttsManager.stopSpeaking();
        }

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
//             console.log(`navigate: Loading content for index ${newIndex} for book ${bookId}`);
            
            const contentLoaded = await loadAndRenderContent(epubWrapperInstance, bookId, newIndex, totalChapters);

            if (contentLoaded) {
                const baseUrl = window.IS_DEMO_MODE ? `/demo/read/${bookId}` : `/read/${bookId}`;
                const url = `${baseUrl}/${newIndex}`;
                history.pushState({ idx: newIndex, bookId: bookId }, '', url);
                config.currentIndex = newIndex; 
                updatePrevNextButtons(totalChapters); // This function now updates counts too
                
                viewerElement.scrollTop = 0;
                document.documentElement.scrollTop = 0;
//                 console.log(`navigate: Successfully navigated to index ${newIndex}`);
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
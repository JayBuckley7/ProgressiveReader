// translationManager.js

let contentArea; // Set by init
let translateButton, translateCefrButton, loadCachedBtn, revertBtn, manualLoadCachedBtn, autoloadCheckbox, preferDueCardsCheckbox;

let originalPageContent = "";
let trueOriginalServerContent = ""; // Pristine content from server

let currentBookIdForTranslation = null;
let currentPageIndexForTranslation = 0;
let apiKeyIsConfigured = false;
let serverDefaultModelForTranslation = 'gpt-4o-mini';
const CEFR_LEVELS_TRANSLATION = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']; // Must match settingsModal.js if shared

let isCurrentlyStreaming = false;
let streamingIndicator = null;

let translationBuffer = null;
let lastRenderedLength = 0;

function _selectDOMElements() {
    translateButton = document.getElementById('translate-btn');
    translateCefrButton = document.getElementById('translate-cefr-btn');
    loadCachedBtn = document.getElementById('load-cached-btn');
    revertBtn = document.getElementById('revert-translation-btn');
    manualLoadCachedBtn = document.getElementById('manual-load-cached-btn');
    autoloadCheckbox = document.getElementById('autoload-checkbox');
    preferDueCardsCheckbox = document.getElementById('prefer-due-cards');
}

function updateDisplayButtons() {
    if (currentBookIdForTranslation === null || !contentArea) return;
    
    const getCookieFunc = window.appUtils ? window.appUtils.getCookie : getCookie;
    const loadTranslationFunc = window.storageManager ? window.storageManager.loadTranslationFromLocal : loadTranslationFromLocal;
    const getAutoloadPrefFunc = window.storageManager ? window.storageManager.getAutoloadPreference : getAutoloadPreference;

    const cachedTranslation = loadTranslationFunc(currentBookIdForTranslation, currentPageIndexForTranslation);
    const isCurrentlyShowingTranslation = originalPageContent && contentArea.innerHTML !== originalPageContent;
    const autoloadEnabled = getAutoloadPrefFunc();

    if (loadCachedBtn) {
        if (cachedTranslation && !isCurrentlyShowingTranslation && !autoloadEnabled) {
            loadCachedBtn.style.display = 'inline-block';
        } else {
            loadCachedBtn.style.display = 'none';
        }
    }
    if (revertBtn) {
        if (isCurrentlyShowingTranslation) {
            revertBtn.style.display = 'inline-block';
        } else {
            revertBtn.style.display = 'none';
        }
    }
}

function createStreamingIndicator() {
    if (streamingIndicator) return streamingIndicator;
    
    // Create a more informative indicator element to show streaming status
    streamingIndicator = document.createElement('div');
    streamingIndicator.className = 'translation-streaming-indicator';
    streamingIndicator.style.position = 'fixed';
    streamingIndicator.style.bottom = '20px';
    streamingIndicator.style.right = '20px';
    streamingIndicator.style.backgroundColor = 'rgba(0, 123, 255, 0.8)';
    streamingIndicator.style.color = 'white';
    streamingIndicator.style.padding = '10px 15px';
    streamingIndicator.style.borderRadius = '6px';
    streamingIndicator.style.fontSize = '15px';
    streamingIndicator.style.zIndex = '1000';
    streamingIndicator.style.display = 'none';
    streamingIndicator.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    streamingIndicator.style.transition = 'all 0.3s ease';
    
    // Add progress visualization
    streamingIndicator.innerHTML = `
        <div style="display: flex; align-items: center;">
            <div style="margin-right: 10px; display: inline-block;">
                <span class="translation-dots" style="display: inline-block;">
                    <span style="animation: blink 1.4s infinite both; animation-delay: 0s;">⋯</span>
                </span>
            </div>
            <div>
                <div>Translating content</div>
                <div style="font-size: 12px; opacity: 0.8;">Original content visible until complete</div>
            </div>
        </div>
    `;
    
    // Add some CSS animation for the dots
    const style = document.createElement('style');
    style.textContent = `
        @keyframes blink {
            0% { opacity: 0.2; }
            20% { opacity: 1; }
            100% { opacity: 0.2; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(streamingIndicator);
    return streamingIndicator;
}

function showStreamingIndicator() {
    const indicator = createStreamingIndicator();
    isCurrentlyStreaming = true;
    indicator.style.display = 'block';
}

function hideStreamingIndicator() {
    if (streamingIndicator) {
        isCurrentlyStreaming = false;
        streamingIndicator.style.display = 'none';
    }
}

function createBufferElement() {
    if (translationBuffer) return translationBuffer;
    
    // Create a hidden div to safely parse the incoming HTML
    translationBuffer = document.createElement('div');
    translationBuffer.style.display = 'none';
    document.body.appendChild(translationBuffer);
    return translationBuffer;
}

function getCompleteHtmlElements(html) {
    // Create temporary element to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Check if inner HTML matches what we put in - if it does, it's valid HTML
    // If not, browser might have auto-corrected incomplete tags
    return temp.innerHTML;
}

async function callTranslateAPI(payload) {
    if (!contentArea) {
        console.error("Content area not set for translation manager.");
        alert("Error: Content area not found.");
        return;
    }
    const buttonElement = payload.cefr_level ? translateCefrButton : translateButton;
    if (!buttonElement) {
        console.error("Translate button not found for this action.");
        return;
    }
    const originalButtonText = buttonElement.textContent;
    buttonElement.textContent = 'Translating...';
    buttonElement.disabled = true;

    // Restore the check for null bookId:
    if (currentBookIdForTranslation === null) {
        alert("Error: No book context for translation.");
        buttonElement.textContent = originalButtonText;
        buttonElement.disabled = false;
        return;
    }
    
    // Ensure original content is stored before translating (if not already a translation)
    if (!originalPageContent || contentArea.innerHTML === originalPageContent) {
         originalPageContent = contentArea.innerHTML; 
    }

    try {
        payload.item_index = currentPageIndexForTranslation;
        payload.content = originalPageContent;
        // Enable streaming by default
        payload.stream = true;

        const preferDue = window.storageManager ? window.storageManager.getPreferDueCards()
                                                : (preferDueCardsCheckbox && preferDueCardsCheckbox.checked);
        if (preferDue && window.storageManager) {
            const cached = window.storageManager.getCachedDueCards();
            if (cached) {
                payload.due_cards = cached;
            } else if (typeof window.storageManager.prefetchDueCardsIfNeeded === 'function') {
                window.storageManager.prefetchDueCardsIfNeeded();
            }
        }

        if (payload.stream) {
            // Handle streaming response using EventSource
            const response = await fetch("/api/translate", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            // Show streaming indicator
            showStreamingIndicator();
            
            // Prepare buffer element
            const buffer = createBufferElement();
            buffer.innerHTML = "";
            
            // Keep original content visible until we have enough translated content
            let accumulatedHtml = "";
            lastRenderedLength = 0;
            
            // Create a reader for the streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let textBuffer = "";
            let finalTranslatedText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                // Decode chunk and add to buffer
                textBuffer += decoder.decode(value, { stream: true });
                
                // Process each complete SSE message in the textBuffer
                while (true) {
                    const messageEnd = textBuffer.indexOf("\n\n");
                    if (messageEnd === -1) break;
                    
                    const message = textBuffer.substring(0, messageEnd);
                    textBuffer = textBuffer.substring(messageEnd + 2);
                    
                    if (message.startsWith("data: ")) {
                        const data = message.substring(6);
                        if (data === "[DONE]") {
                            break;
                        }
                        
                        try {
                            const parsedData = JSON.parse(data);
                            
                            // Handle status message
                            if (parsedData.status === "started") {
//                                 console.log("Translation streaming started");
                                // But we don't clear the content area immediately
                                // We'll keep showing the original content until we have complete HTML
                                continue;
                            }
                            
                            // Handle content chunks
                            if (parsedData.content) {
                                // Add new content to our accumulated HTML
                                accumulatedHtml += parsedData.content;
                                
                                // Try to render only complete elements
                                buffer.innerHTML = accumulatedHtml;
                                
                                // Check if we have at least a complete paragraph or significant content
                                // that's worth updating the display for
                                const completeElements = Array.from(buffer.children);
                                
                                // Only update display if we have significantly more content
                                // or if we have complete, meaningful elements
                                const hasCompleteElements = completeElements.length > 0;
                                const hasSignificantNewContent = accumulatedHtml.length > lastRenderedLength + 100;
                                
                                if (hasCompleteElements && (hasSignificantNewContent || parsedData.complete)) {
                                    // We have enough content to update the display
                                    lastRenderedLength = accumulatedHtml.length;
                                    // Only show complete elements (exclude any partial content at the end)
                                    contentArea.innerHTML = buffer.innerHTML;
                                    
                                    // Scroll to keep current position visible if needed
                                    if (contentArea.scrollHeight > contentArea.clientHeight) {
                                        contentArea.scrollTop = contentArea.scrollHeight;
                                    }
                                }
                            }
                            
                            // Handle completion message with full translated text for caching
                            if (parsedData.complete && parsedData.translated_text) {
                                finalTranslatedText = parsedData.translated_text;
                                // Ensure the final state is set correctly with the complete translation
                                contentArea.innerHTML = finalTranslatedText;
                                
                                // Save the complete translation to cache
                                if (window.storageManager) {
                                    window.storageManager.saveTranslationToLocal(
                                        currentBookIdForTranslation, 
                                        currentPageIndexForTranslation, 
                                        finalTranslatedText
                                    );
                                }
                            }
                        } catch (error) {
                            console.error('Error parsing SSE data:', error, data);
                        }
                    }
                }
            }
            
            // Clean up buffer
            if (translationBuffer) {
                translationBuffer.innerHTML = "";
            }
            
            // Make sure we update the button states after translation
            updateDisplayButtons();
        } else {
            // Original non-streaming implementation as fallback
            const response = await fetch("/api/translate", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.translated_text) {
                contentArea.innerHTML = data.translated_text;
                if (window.storageManager) {
                    window.storageManager.saveTranslationToLocal(
                        currentBookIdForTranslation, 
                        currentPageIndexForTranslation, 
                        data.translated_text
                    );
                }
                updateDisplayButtons();
            } else { 
                throw new Error('No translation returned from server.'); 
            }
        }
    } catch (error) {
        console.error('Translation Error:', error);
        alert(`Error during translation: ${error.message}`);
    } finally {
        buttonElement.textContent = originalButtonText;
        buttonElement.disabled = false;
        hideStreamingIndicator();
    }
}

function _attachEventListeners() {
    const getCookieFunc = window.appUtils ? window.appUtils.getCookie : getCookie;
    const saveAutoloadPrefFunc = window.storageManager ? window.storageManager.saveAutoloadPreference : saveAutoloadPreference;
    const loadTranslationFunc = window.storageManager ? window.storageManager.loadTranslationFromLocal : loadTranslationFromLocal;
    const defaultSettings = window.settingsModalManager ? window.settingsModalManager.DEFAULT_SETTINGS_MODAL : DEFAULT_SETTINGS_MODAL;

    if (translateButton) {
        translateButton.addEventListener('click', () => {
            if (!window.IS_DEMO_MODE && !apiKeyIsConfigured && !getCookieFunc('openai_api_key')) {
                 alert('Please configure your OpenAI API key in Settings.'); return;
            }
            localStorage.setItem('lastTranslationMethod', 'standard'); // Store method
            const settings = {
                api_key: getCookieFunc('openai_api_key') || '',
                model: getCookieFunc('openai_model') || serverDefaultModelForTranslation,
                target_language: getCookieFunc('target_language') || (defaultSettings ? defaultSettings.language : 'Spanish'),
            };
            callTranslateAPI(settings);
        });
    }

    if (translateCefrButton) {
        translateCefrButton.addEventListener('click', () => {
             if (!window.IS_DEMO_MODE && !apiKeyIsConfigured && !getCookieFunc('openai_api_key')) {
                 alert('Please configure your OpenAI API key in Settings.'); return;
            }
            localStorage.setItem('lastTranslationMethod', 'cefr'); // Store method
            const cefrIndex = getCookieFunc('cefr_index') || (defaultSettings ? defaultSettings.cefrIndex : 3);
            const settings = {
                api_key: getCookieFunc('openai_api_key') || '',
                model: getCookieFunc('openai_model') || serverDefaultModelForTranslation,
                target_language: getCookieFunc('target_language') || (defaultSettings ? defaultSettings.language : 'Spanish'),
                cefr_level: CEFR_LEVELS_TRANSLATION[cefrIndex]
            };
            callTranslateAPI(settings);
        });
    }

    if (autoloadCheckbox) {
        autoloadCheckbox.addEventListener('change', function() {
            saveAutoloadPrefFunc(this.checked);
            if (this.checked && currentBookIdForTranslation !== null) {
                const cachedTranslation = loadTranslationFunc(currentBookIdForTranslation, currentPageIndexForTranslation);
                if (cachedTranslation && contentArea.innerHTML !== cachedTranslation) {
                     if (!originalPageContent || contentArea.innerHTML === trueOriginalServerContent) {
                        originalPageContent = contentArea.innerHTML;
                     }
                     contentArea.innerHTML = cachedTranslation;
                     updateDisplayButtons();
                }
            }
        });
    }

    if (loadCachedBtn) {
        loadCachedBtn.addEventListener('click', () => {
            if (currentBookIdForTranslation === null) return;
            const cachedTranslation = loadTranslationFunc(currentBookIdForTranslation, currentPageIndexForTranslation);
            if (cachedTranslation) {
                if (!originalPageContent || contentArea.innerHTML === trueOriginalServerContent) {
                    originalPageContent = contentArea.innerHTML;
                }
                contentArea.innerHTML = cachedTranslation;
                updateDisplayButtons();
            } else {
                alert("No cached translation found for this page.");
            }
        });
    }
    
    if (manualLoadCachedBtn && window.settingsModalManager) { // manualLoadCachedBtn is inside settings modal
        manualLoadCachedBtn.addEventListener('click', () => {
            if (currentBookIdForTranslation === null) return;
            const cachedTranslation = loadTranslationFunc(currentBookIdForTranslation, currentPageIndexForTranslation);
            if (cachedTranslation) {
                if (contentArea.innerHTML === cachedTranslation) {
                     alert("Cached translation is already displayed.");
                } else {
                    if (!originalPageContent || contentArea.innerHTML === trueOriginalServerContent) {
                        originalPageContent = contentArea.innerHTML;
                    }
                    contentArea.innerHTML = cachedTranslation;
                    updateDisplayButtons();
                    window.settingsModalManager.closeSettingsModal();
                }
            } else {
                alert("No cached translation found for this page.");
            }
        });
    }

    if (revertBtn) {
        revertBtn.addEventListener('click', () => {
            if (originalPageContent) {
                 contentArea.innerHTML = originalPageContent;
                 // originalPageContent should remain as the actual original before any translation
                 // if what's being shown is a translation. If it was already original, then this is fine.
                 // This logic means originalPageContent must be the *true* base for the current view.
                 // If a highlight was applied over a translation, originalPageContent must be the translation.
                 // For simplicity now: revertBtn implies reverting a translation, so originalPageContent was the non-translated version.
                 updateDisplayButtons(); 
            } else {
                // Fallback to absolute original if originalPageContent is somehow lost
                contentArea.innerHTML = trueOriginalServerContent;
                originalPageContent = trueOriginalServerContent; // Reset
                updateDisplayButtons();
            }
        });
    }
}

function initTranslationManager(config) {
    contentArea = document.querySelector('.epub-content');
    if (!contentArea) {
        console.error("TranslationManager: .epub-content area not found!");
        return;
    }
    trueOriginalServerContent = contentArea.innerHTML; // Store once on init
    originalPageContent = trueOriginalServerContent;   // Initially, original is the server content
    
    currentBookIdForTranslation = config.currentBookId;
    currentPageIndexForTranslation = config.pageCurrentIndex;
    apiKeyIsConfigured = config.apiKeyStatusConfigured;
    serverDefaultModelForTranslation = config.serverDefaultModel;

    _selectDOMElements();
    _attachEventListeners();

    // Initial setup for autoloading translations
    let autoloadInitialized = false;
    
    function initializeAutoload() {
        if (autoloadInitialized || !autoloadCheckbox || !window.storageManager) return;
        
        autoloadCheckbox.checked = window.storageManager.getAutoloadPreference();
        if (autoloadCheckbox.checked && currentBookIdForTranslation !== null) {
            const cachedTranslation = window.storageManager.loadTranslationFromLocal(
                currentBookIdForTranslation, 
                currentPageIndexForTranslation
            );
            
            if (cachedTranslation && contentArea) {
//                 console.log("TranslationManager: Autoloading translation from cache for book:", 
//                             currentBookIdForTranslation, 
//                             "page:", currentPageIndexForTranslation);
                
                // Only apply cached translation if we have actual content (not loading placeholder)
                const isLoadingPlaceholder = contentArea.innerHTML.includes("Loading content from storage");
                if (!isLoadingPlaceholder) {
                    originalPageContent = contentArea.innerHTML; // Store current before overwriting
                    contentArea.innerHTML = cachedTranslation;
                    updateDisplayButtons();
                    autoloadInitialized = true;
                } else {
//                     console.log("TranslationManager: Delaying autoload until real content is available");
                }
            }
        }
    }

    // Listen for ebookContentLoaded event to update content references and handle autoload
    document.addEventListener('ebookContentLoaded', (event) => {
//         console.log("TranslationManager: Detected new content loaded", event.detail);
        // Update the original content references when new content is loaded
        if (contentArea) {
//             console.log("TranslationManager: Updating content references from:", 
//                         trueOriginalServerContent.substring(0, 50) + "...",
//                         "to current content:", 
//                         contentArea.innerHTML.substring(0, 50) + "...");
            
            // Store the new content as the original content
            trueOriginalServerContent = contentArea.innerHTML;
            originalPageContent = trueOriginalServerContent;
            
            // Update the current page index
            currentPageIndexForTranslation = event.detail.chapterIndex;
//             console.log("TranslationManager: Updated page index to:", currentPageIndexForTranslation);
            
            // Try autoloading translations after content is loaded
            initializeAutoload();
            
            // Update buttons visibility based on new content
            updateDisplayButtons();
        } else {
            console.error("TranslationManager: Content area not available when handling ebookContentLoaded");
        }
    });

    // Try initial autoload but it may be delayed until real content is available
    initializeAutoload();
    
    updateDisplayButtons();
//     console.log("TranslationManager initialized.");
}

window.translationManager = {
    initTranslationManager,
    updateDisplayButtons, // May be needed by other modules if content changes
    getOriginalPageContent: () => originalPageContent,
    getTrueOriginalServerContent: () => trueOriginalServerContent,
    setOriginalPageContent: (content) => { originalPageContent = content; }, // For highlighter to restore to
    setContentAreaHTML: (html) => { if(contentArea) contentArea.innerHTML = html; },
    triggerTranslation: (method) => { // New function for smart translate
        const getCookieFunc = window.appUtils ? window.appUtils.getCookie : getCookie;
        const defaultSettings = window.settingsModalManager ? window.settingsModalManager.DEFAULT_SETTINGS_MODAL : DEFAULT_SETTINGS_MODAL;
        
        if (!window.IS_DEMO_MODE && !apiKeyIsConfigured && !getCookieFunc('openai_api_key')) {
            alert('Please configure your OpenAI API key in Settings.'); return;
        }

        let effectiveMethod = method;
        if (window.IS_DEMO_MODE && method === 'standard') {
//             console.log('[TranslationManager] Demo mode: Forcing standard translate to CEFR C2.');
            effectiveMethod = 'cefr'; 
            // The CEFR level will be set to C2 equivalent below if effectiveMethod is 'cefr'
        }

        let settings = {
            api_key: getCookieFunc('openai_api_key') || '',
            model: getCookieFunc('openai_model') || serverDefaultModelForTranslation,
            target_language: getCookieFunc('target_language') || (defaultSettings ? defaultSettings.language : 'Japanese'),
        };

        if (effectiveMethod === 'cefr') {
            let cefrIndexToUse = getCookieFunc('cefr_index') || (defaultSettings ? defaultSettings.cefrIndex : 3); // Default B2
            // If it was a standard call forced to CEFR in demo, ensure C2 is used.
            if (window.IS_DEMO_MODE && method === 'standard') {
                cefrIndexToUse = 5; // Index for C2 (A1=0, A2=1, B1=2, B2=3, C1=4, C2=5)
            }
            settings.cefr_level = CEFR_LEVELS_TRANSLATION[cefrIndexToUse];
            localStorage.setItem('lastTranslationMethod', 'cefr'); 
        } else { // This 'else' handles the original 'standard' method if not in demo or not forced
            localStorage.setItem('lastTranslationMethod', 'standard'); 
        }
        callTranslateAPI(settings);
    }
}; 
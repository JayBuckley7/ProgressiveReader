// translationManager.js

let contentArea; // Set by init
let translateButton, translateCefrButton, loadCachedBtn, revertBtn, manualLoadCachedBtn, autoloadCheckbox;

let originalPageContent = "";
let trueOriginalServerContent = ""; // Pristine content from server

let currentBookIdForTranslation = null;
let currentPageIndexForTranslation = 0;
let apiKeyIsConfigured = false;
let serverDefaultModelForTranslation = 'gpt-4o-mini';
const CEFR_LEVELS_TRANSLATION = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']; // Must match settingsModal.js if shared

function _selectDOMElements() {
    translateButton = document.getElementById('translate-btn');
    translateCefrButton = document.getElementById('translate-cefr-btn');
    loadCachedBtn = document.getElementById('load-cached-btn');
    revertBtn = document.getElementById('revert-translation-btn');
    manualLoadCachedBtn = document.getElementById('manual-load-cached-btn');
    autoloadCheckbox = document.getElementById('autoload-checkbox');
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

        const response = await fetch("/api/translate", { // Corrected endpoint
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
                window.storageManager.saveTranslationToLocal(currentBookIdForTranslation, currentPageIndexForTranslation, data.translated_text);
             }
             updateDisplayButtons();
        } else { throw new Error('No translation returned from server.'); }
    } catch (error) {
        console.error('Translation Error:', error);
        alert(`Error during translation: ${error.message}`);
    } finally {
        buttonElement.textContent = originalButtonText;
        buttonElement.disabled = false;
    }
}

function _attachEventListeners() {
    const getCookieFunc = window.appUtils ? window.appUtils.getCookie : getCookie;
    const saveAutoloadPrefFunc = window.storageManager ? window.storageManager.saveAutoloadPreference : saveAutoloadPreference;
    const loadTranslationFunc = window.storageManager ? window.storageManager.loadTranslationFromLocal : loadTranslationFromLocal;
    const defaultSettings = window.settingsModalManager ? window.settingsModalManager.DEFAULT_SETTINGS_MODAL : DEFAULT_SETTINGS_MODAL;

    if (translateButton) {
        translateButton.addEventListener('click', () => {
            if (!apiKeyIsConfigured && !getCookieFunc('openai_api_key')) {
                 alert('Please configure your OpenAI API key in Settings.'); return;
            }
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
             if (!apiKeyIsConfigured && !getCookieFunc('openai_api_key')) {
                 alert('Please configure your OpenAI API key in Settings.'); return;
            }
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

    // Initial setup
    if(autoloadCheckbox && window.storageManager) {
      autoloadCheckbox.checked = window.storageManager.getAutoloadPreference();
      if (autoloadCheckbox.checked && currentBookIdForTranslation !== null) {
          const initialCachedTranslation = window.storageManager.loadTranslationFromLocal(currentBookIdForTranslation, currentPageIndexForTranslation);
          if (initialCachedTranslation) {
              console.log("Autoloading translation from cache on page load for book:", currentBookIdForTranslation);
              originalPageContent = contentArea.innerHTML; // Store current before overwriting
              contentArea.innerHTML = initialCachedTranslation;
          }
      }
    }
    updateDisplayButtons();
    console.log("TranslationManager initialized.");
}

window.translationManager = {
    initTranslationManager,
    updateDisplayButtons, // May be needed by other modules if content changes
    getOriginalPageContent: () => originalPageContent,
    getTrueOriginalServerContent: () => trueOriginalServerContent,
    setOriginalPageContent: (content) => { originalPageContent = content; }, // For highlighter to restore to
    setContentAreaHTML: (html) => { if(contentArea) contentArea.innerHTML = html; }
}; 
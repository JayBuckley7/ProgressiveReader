// settingsModal.js

let settingsModal, toggleSettingsBtn, settingsCloseBtn, apiKeyInput, modelSelect, languageSelect, cefrSlider, cefrOutput;
let jpdbApiKeyInput, miningDeckIdInput, customWordCssInput, themeSelect;
let forqDeckIdInput, blacklistDeckIdInput, neverForgetDeckIdInput, contextWidthInput, forqOnMineCheckbox;
let showPopupKeyInput, addKeyInput, dialogKeyInput, blacklistKeyInput, neverForgetKeyInput;
let nothingKeyInput, somethingKeyInput, hardKeyInput, goodKeyInput, easyKeyInput;
let showPopupOnHoverCheckbox, touchscreenSupportCheckbox, disableFadeAnimationCheckbox;
let customPopupCssInput, exportSettingsBtn, importSettingsBtn;
let panelNavButtons, settingPanels;
let autoloadCheckbox;
let preferDueCardsCheckbox;

const CEFR_LEVELS_SETTINGS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_SETTINGS_MODAL = { 
    apiKey: '', 
    // model will be set from serverDefaultModel passed to init or readerInit
    language: 'Japanese', 
    cefrIndex: 3, 
    jpdbApiKey: '', 
    userTheme: 'system',
    miningDeckId: '',
    forqDeckId: '',
    blacklistDeckId: '',
    neverForgetDeckId: '',
    contextWidth: 1,
    forqOnMine: false,
    preferDueCards: false,
    showPopupKey: 'ShiftLeft',
    addKey: 'None',
    dialogKey: 'None',
    blacklistKey: 'None',
    neverForgetKey: 'None',
    nothingKey: 'None',
    somethingKey: 'None',
    hardKey: 'None',
    goodKey: 'None',
    easyKey: 'None',
    showPopupOnHover: true,
    touchscreenSupport: false,
    disableFadeAnimation: false,
    customWordCSS: '',
    customPopupCSS: ''
};
let serverProvidedDefaultModel = 'gpt-4o-mini'; // Fallback, should be updated by init

function _selectDOMElements() {
    settingsModal = document.getElementById('settings-modal');
    toggleSettingsBtn = document.getElementById('toggle-settings-btn');
    settingsCloseBtn = document.querySelector('#settings-modal .close-modal-btn');
    apiKeyInput = document.getElementById('openai-key');
    modelSelect = document.getElementById('openai-model');
    languageSelect = document.getElementById('target-language');
    cefrSlider = document.getElementById('cefr-level');
    cefrOutput = document.getElementById('cefr-output');
    jpdbApiKeyInput = document.getElementById('jpdb-api-key');
    miningDeckIdInput = document.getElementById('mining-deck-id');
    customWordCssInput = document.getElementById('custom-word-css');
    themeSelect = document.getElementById('theme-select');
    forqDeckIdInput = document.getElementById('forq-deck-id');
    blacklistDeckIdInput = document.getElementById('blacklist-deck-id');
    neverForgetDeckIdInput = document.getElementById('never-forget-deck-id');
    contextWidthInput = document.getElementById('context-width');
    forqOnMineCheckbox = document.getElementById('forq-on-mine');
    showPopupKeyInput = document.getElementById('show-popup-key');
    addKeyInput = document.getElementById('add-key');
    dialogKeyInput = document.getElementById('dialog-key');
    blacklistKeyInput = document.getElementById('blacklist-key');
    neverForgetKeyInput = document.getElementById('never-forget-key');
    nothingKeyInput = document.getElementById('nothing-key');
    somethingKeyInput = document.getElementById('something-key');
    hardKeyInput = document.getElementById('hard-key');
    goodKeyInput = document.getElementById('good-key');
    easyKeyInput = document.getElementById('easy-key');
    showPopupOnHoverCheckbox = document.getElementById('show-popup-on-hover');
    touchscreenSupportCheckbox = document.getElementById('touchscreen-support');
    disableFadeAnimationCheckbox = document.getElementById('disable-fade-animation');
    customPopupCssInput = document.getElementById('custom-popup-css');
    exportSettingsBtn = document.getElementById('export-settings-btn');
    importSettingsBtn = document.getElementById('import-settings-btn');
    panelNavButtons = document.querySelectorAll('.panel-nav-btn');
    settingPanels = document.querySelectorAll('.settings-panel-content');
    autoloadCheckbox = document.getElementById('autoload-checkbox');
    preferDueCardsCheckbox = document.getElementById('prefer-due-cards');
}

function _updateCefrOutput() {
    if (cefrOutput && cefrSlider) {
        cefrOutput.textContent = CEFR_LEVELS_SETTINGS[cefrSlider.value];
    }
}

function openSettingsModal() {
    if (settingsModal) {
        _loadSettingsToUI(); 
        settingsModal.classList.add('active');
    }
}

function closeSettingsModal() {
    if (settingsModal) {
        settingsModal.classList.remove('active');
    }
}

function _updateJlptToggleVisibility() {
    const jlptToggleContainer = document.getElementById('jlpt-toggle-container'); // Query it directly
    if (languageSelect && jlptToggleContainer) {
        if (languageSelect.value === 'Japanese') {
            jlptToggleContainer.style.display = 'inline-block';
        } else {
            jlptToggleContainer.style.display = 'none';
        }
    }
}

function _updateDueCardsVisibility() {
    const container = document.getElementById('prefer-due-cards-container');
    if (!container) return;
    const getCookieFunc = window.appUtils ? window.appUtils.getCookie : getCookie;
    const key = getCookieFunc('jpdb_api_key');
    if (key && key !== 'demo_mode_key') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function _loadSettingsToUI() {
    const getCookieFunc = window.appUtils ? window.appUtils.getCookie : getCookie;
    const effectiveDefaultModel = serverProvidedDefaultModel || DEFAULT_SETTINGS_MODAL.model;

    if(apiKeyInput) apiKeyInput.value = getCookieFunc('openai_api_key') || DEFAULT_SETTINGS_MODAL.apiKey;
    if(jpdbApiKeyInput) jpdbApiKeyInput.value = getCookieFunc('jpdb_api_key') || DEFAULT_SETTINGS_MODAL.jpdbApiKey;
    if(modelSelect) modelSelect.value = getCookieFunc('openai_model') || effectiveDefaultModel;
    if(languageSelect) languageSelect.value = getCookieFunc('target_language') || DEFAULT_SETTINGS_MODAL.language;
    if(cefrSlider) cefrSlider.value = getCookieFunc('cefr_index') || DEFAULT_SETTINGS_MODAL.cefrIndex;
    if(themeSelect) themeSelect.value = localStorage.getItem('userTheme') || DEFAULT_SETTINGS_MODAL.userTheme;
    
    if(miningDeckIdInput) miningDeckIdInput.value = localStorage.getItem('jpdbMiningDeckId') || DEFAULT_SETTINGS_MODAL.miningDeckId;
    if(customWordCssInput) customWordCssInput.value = localStorage.getItem('customWordCSS') || DEFAULT_SETTINGS_MODAL.customWordCSS;
    if(forqDeckIdInput) forqDeckIdInput.value = localStorage.getItem('forqDeckId') || DEFAULT_SETTINGS_MODAL.forqDeckId;
    if(blacklistDeckIdInput) blacklistDeckIdInput.value = localStorage.getItem('blacklistDeckId') || DEFAULT_SETTINGS_MODAL.blacklistDeckId;
    if(neverForgetDeckIdInput) neverForgetDeckIdInput.value = localStorage.getItem('neverForgetDeckId') || DEFAULT_SETTINGS_MODAL.neverForgetDeckId;
    if(contextWidthInput) contextWidthInput.value = localStorage.getItem('contextWidth') || DEFAULT_SETTINGS_MODAL.contextWidth;
    if(forqOnMineCheckbox) forqOnMineCheckbox.checked = localStorage.getItem('forqOnMine') === null ? DEFAULT_SETTINGS_MODAL.forqOnMine : localStorage.getItem('forqOnMine') === 'true';

    const keybindFields = [
        {el: showPopupKeyInput, key: 'showPopupKey'},
        {el: addKeyInput, key: 'addKey'},
        {el: dialogKeyInput, key: 'dialogKey'},
        {el: blacklistKeyInput, key: 'blacklistKey'},
        {el: neverForgetKeyInput, key: 'neverForgetKey'},
        {el: nothingKeyInput, key: 'nothingKey'},
        {el: somethingKeyInput, key: 'somethingKey'},
        {el: hardKeyInput, key: 'hardKey'},
        {el: goodKeyInput, key: 'goodKey'},
        {el: easyKeyInput, key: 'easyKey'}
    ];
    
    // Helper function for keybind display - defined within _loadSettingsToUI scope
    function keybindToStringForLoad(keybindValue) {
        // If keybindValue is 'None' or falsy, return 'None'
        if (!keybindValue || keybindValue === 'None') return 'None';
        
        try {
            // Try to parse as JSON first (for new format)
            const parsedKeybind = JSON.parse(keybindValue);
            return keybindToString(parsedKeybind); // Pass object to keybindToString
        } catch (e) {
            // If parsing fails, it's an old format string (likely an event.code)
            if (keybindValue === 'ShiftLeft') return 'Left Shift';
            if (keybindValue === 'ShiftRight') return 'Right Shift';
            if (keybindValue === 'ControlLeft') return 'Left Control';
            if (keybindValue === 'ControlRight') return 'Right Control';
            if (keybindValue === 'AltLeft') return 'Left Alt';
            if (keybindValue === 'AltRight') return 'Right Alt';
            if (keybindValue === 'MetaLeft') return 'Left Cmd/Win';
            if (keybindValue === 'MetaRight') return 'Right Cmd/Win';
            return keybindValue; // Fallback: return the string as is
        }
    }
    
    keybindFields.forEach(item => {
        if (item.el) {
            const savedValue = localStorage.getItem(item.key);
            item.el.value = keybindToStringForLoad(savedValue) || keybindToStringForLoad(DEFAULT_SETTINGS_MODAL[item.key]);
            
            // Store the localStorage key for use in click event handler
            item.el.dataset.localStorageKey = item.key;
            
            // Apply visual styling to indicate these are keybind inputs
            item.el.classList.add('keybind-input');
        }
    });

    if(showPopupOnHoverCheckbox) showPopupOnHoverCheckbox.checked = localStorage.getItem('showPopupOnHover') === null ? DEFAULT_SETTINGS_MODAL.showPopupOnHover : localStorage.getItem('showPopupOnHover') === 'true';
    if(touchscreenSupportCheckbox) touchscreenSupportCheckbox.checked = localStorage.getItem('touchscreenSupport') === null ? DEFAULT_SETTINGS_MODAL.touchscreenSupport : localStorage.getItem('touchscreenSupport') === 'true';
    if(disableFadeAnimationCheckbox) disableFadeAnimationCheckbox.checked = localStorage.getItem('disableFadeAnimation') === null ? DEFAULT_SETTINGS_MODAL.disableFadeAnimation : localStorage.getItem('disableFadeAnimation') === 'true';
    if(customPopupCssInput) customPopupCssInput.value = localStorage.getItem('customPopupCSS') || DEFAULT_SETTINGS_MODAL.customPopupCSS;
    
    // Load Autoload Translations preference
    if (autoloadCheckbox && window.storageManager && typeof window.storageManager.getAutoloadPreference === 'function') {
        autoloadCheckbox.checked = window.storageManager.getAutoloadPreference();
    }
    if (preferDueCardsCheckbox) {
        preferDueCardsCheckbox.checked = localStorage.getItem('prefer_due_cards') === 'true';
    }

    _updateCefrOutput();
    _updateJlptToggleVisibility();
    _updateDueCardsVisibility();
//     console.log("Settings loaded into UI.");
}

function _attachEventListeners() {
    const setCookieFunc = window.appUtils ? window.appUtils.setCookie : setCookie;
    const applyThemeFunc = window.themeManager ? window.themeManager.applyTheme : applyTheme;
    const applyCustomWordCssFunc = window.customCssManager ? window.customCssManager.applyCustomWordCss : applyCustomWordCss;

    if (toggleSettingsBtn) toggleSettingsBtn.addEventListener('click', openSettingsModal);
    if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettingsModal);
    window.addEventListener('click', (event) => {
        if (settingsModal && event.target == settingsModal) closeSettingsModal();
    });
    if (cefrSlider) cefrSlider.addEventListener('input', () => {
        _updateCefrOutput();
        if (window.appUtils) window.appUtils.setCookie('cefr_index', cefrSlider.value);
        localStorage.setItem('cefr_index', cefrSlider.value);
    });
    if (apiKeyInput) apiKeyInput.addEventListener('input', () => { if (window.appUtils) window.appUtils.setCookie('openai_api_key', apiKeyInput.value.trim()); });
    if (modelSelect) modelSelect.addEventListener('change', () => {
         if (window.appUtils) window.appUtils.setCookie('openai_model', modelSelect.value);
         localStorage.setItem('openai_model', modelSelect.value);
    });
    if (languageSelect) languageSelect.addEventListener('change', () => {
        if (window.appUtils) window.appUtils.setCookie('target_language', languageSelect.value);
        localStorage.setItem('target_language', languageSelect.value);
        _updateJlptToggleVisibility();
    });
    // Note: ThemeSelect listener is in themeManager.js as it calls applyTheme directly.

    if (jpdbApiKeyInput) {
        jpdbApiKeyInput.addEventListener('change', () => {
            const apiKeyValue = jpdbApiKeyInput.value.trim();
//             console.log(`JPDB API Key changed. New value length: ${apiKeyValue.length}`);
            
            if (window.appUtils) {
//                 console.log('Using appUtils.setCookie to save JPDB API key');
                window.appUtils.setCookie('jpdb_api_key', apiKeyValue);
            } else {
//                 console.log('Using direct setCookie function to save JPDB API key');
                setCookie('jpdb_api_key', apiKeyValue);
            }
            
            // Force a config reload on the highlighter to ensure it picks up the new API key
            if (window.jpHighlighter && typeof window.jpHighlighter.loadConfig === 'function') {
//                 console.log('Explicitly reloading JP Highlighter config after API key change');
                const updatedConfig = window.jpHighlighter.loadConfig();
//                 console.log('New config after API key change:', updatedConfig);
            }
            _updateDueCardsVisibility();
            if (window.storageManager && typeof window.storageManager.prefetchDueCardsIfNeeded === 'function') {
                window.storageManager.prefetchDueCardsIfNeeded();
            }
        });

        // Also keep the input event for real-time saving
        jpdbApiKeyInput.addEventListener('input', () => {
            if (window.appUtils) window.appUtils.setCookie('jpdb_api_key', jpdbApiKeyInput.value.trim());
            _updateDueCardsVisibility();
        });
    }
    if (miningDeckIdInput) miningDeckIdInput.addEventListener('input', () => localStorage.setItem('jpdbMiningDeckId', miningDeckIdInput.value.trim()));
    if (customWordCssInput) customWordCssInput.addEventListener('input', () => {
        localStorage.setItem('customWordCSS', customWordCssInput.value);
        if (applyCustomWordCssFunc) applyCustomWordCssFunc();
    });
    if (forqDeckIdInput) forqDeckIdInput.addEventListener('input', () => localStorage.setItem('forqDeckId', forqDeckIdInput.value.trim()));
    if (blacklistDeckIdInput) blacklistDeckIdInput.addEventListener('input', () => localStorage.setItem('blacklistDeckId', blacklistDeckIdInput.value.trim()));
    if (neverForgetDeckIdInput) neverForgetDeckIdInput.addEventListener('input', () => localStorage.setItem('neverForgetDeckId', neverForgetDeckIdInput.value.trim()));
    if (contextWidthInput) contextWidthInput.addEventListener('input', () => localStorage.setItem('contextWidth', contextWidthInput.value));
    if (forqOnMineCheckbox) forqOnMineCheckbox.addEventListener('change', () => localStorage.setItem('forqOnMine', forqOnMineCheckbox.checked));

    const keybindInputsConfig = [
        { el: showPopupKeyInput, key: 'showPopupKey' }, { el: addKeyInput, key: 'addKey' },
        { el: dialogKeyInput, key: 'dialogKey' }, { el: blacklistKeyInput, key: 'blacklistKey' },
        { el: neverForgetKeyInput, key: 'neverForgetKey' }, { el: nothingKeyInput, key: 'nothingKey' },
        { el: somethingKeyInput, key: 'somethingKey' }, { el: hardKeyInput, key: 'hardKey' },
        { el: goodKeyInput, key: 'goodKey' }, { el: easyKeyInput, key: 'easyKey' }
    ];

    let activeKeybindInput = null; // To track which input is currently listening

    const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta']; // Moved here as it's used by keybind logic
    const MOUSE_BUTTONS = ['Left Mouse Button', 'Middle Mouse Button', 'Right Mouse Button'];

    function keybindToString(bind) {
        if (!bind || bind === 'None') return 'None';

        // This function now expects 'bind' to be an object.
        // String-form keybinds should be handled by keybindToStringForLoad.
        if (typeof bind === 'string') {
            // Fallback for safety, though keybindToStringForLoad should map common strings.
            if (bind === 'ShiftLeft') return 'Left Shift';
            if (bind === 'ShiftRight') return 'Right Shift';
            if (bind === 'ControlLeft') return 'Left Control';
            if (bind === 'ControlRight') return 'Right Control';
            if (bind === 'AltLeft') return 'Left Alt';
            if (bind === 'AltRight') return 'Right Alt';
            if (bind === 'MetaLeft') return 'Left Cmd/Win';
            if (bind === 'MetaRight') return 'Right Cmd/Win';
            return bind; // Return unmapped string as is
        }

        // Handle standalone modifier keys from object form {key, code, modifiers}
        if (bind.key && MODIFIERS.includes(bind.key) && (!bind.modifiers || bind.modifiers.length === 0)) {
            if (bind.code === 'ShiftLeft') return 'Left Shift';
            if (bind.code === 'ShiftRight') return 'Right Shift';
            if (bind.code === 'ControlLeft') return 'Left Control';
            if (bind.code === 'ControlRight') return 'Right Control';
            if (bind.code === 'AltLeft') return 'Left Alt';
            if (bind.code === 'AltRight') return 'Right Alt';
            if (bind.code === 'MetaLeft') return 'Left Cmd/Win';
            if (bind.code === 'MetaRight') return 'Right Cmd/Win';
            // Fallback for generic modifier key if code doesn't match specifics
            return bind.key.charAt(0).toUpperCase() + bind.key.slice(1); // e.g., 'Shift'
        }

        // For combinations
        const parts = [];
        if (bind.modifiers && bind.modifiers.length > 0) {
            parts.push(...bind.modifiers.map(m => {
                if (m === 'Meta') return 'Cmd/Win';
                if (m === 'Control') return 'Ctrl';
                return m.charAt(0).toUpperCase() + m.slice(1);
            }));
        }
        
        let mainKeyDisplay = bind.key || '';
        if (bind.key === ' ') mainKeyDisplay = 'Space';
        else if (bind.key && bind.key.startsWith('Arrow')) mainKeyDisplay = bind.key.replace('Arrow', ''); // ArrowUp -> Up
        // Add more key display normalizations if needed (e.g. Enter, Tab, Escape)
        else if (bind.key === 'Escape') mainKeyDisplay = 'Esc';

        if (mainKeyDisplay) {
            // Only add mainKeyDisplay if it's not a modifier already listed in parts,
            // or if it is a modifier but it's the sole key (already handled by standalone logic).
            const capitalizedMainKey = mainKeyDisplay.charAt(0).toUpperCase() + mainKeyDisplay.slice(1);
            if (!MODIFIERS.includes(mainKeyDisplay) && !MODIFIERS.includes(capitalizedMainKey)) {
                parts.push(mainKeyDisplay);
            } else if (MODIFIERS.includes(mainKeyDisplay) && parts.length === 0) {
                 // This case should be covered by standalone modifier logic above.
                 // If it reaches here, it means a modifier key as main part of a combo,
                 // e.g. from a faulty construction. Display its common name.
                 if (mainKeyDisplay === 'Meta') parts.push('Cmd/Win');
                 else if (mainKeyDisplay === 'Control') parts.push('Ctrl');
                 else parts.push(capitalizedMainKey);
            } else if (mainKeyDisplay && !parts.map(p => p.toLowerCase()).includes(mainKeyDisplay.toLowerCase())) {
                 // If it's a modifier like 'Shift' and parts is ['Ctrl'], add 'Shift' -> 'Ctrl+Shift'
                 parts.push(mainKeyDisplay);
            }
        } else if (bind.code) { // Fallback if key is not useful (e.g. empty)
            parts.push(bind.code);
        }
        
        // Remove duplicates that might arise from complex logic, then join
        return parts.length > 0 ? [...new Set(parts)].join('+') : 'None';
    }

    function parseKeybindString(keybindString) {
        if (keybindString === 'None') return 'None';
        // This is a simplification. A robust parser would be needed for complex strings.
        // For now, assume the saved format is either 'None' or a simple key/code string.
        // We will store keybinds as objects { key, code, modifiers } in localStorage.
        // The loading logic will need to be updated to parse this object.
        // For now, let's just return the string, and we'll update the load logic later.
        return keybindString;
    }

    function stopListening(listenerFunc) {
        document.removeEventListener('keydown', listenerFunc);
        document.removeEventListener('keyup', listenerFunc); // Also remove keyup listener
        document.removeEventListener('mousedown', listenerFunc);
        // No need to remove mouseup here as it's not added globally in startListening currently

        if (activeKeybindInput) {
            const localStorageKey = activeKeybindInput.dataset.localStorageKey; // Get key from dataset
            const savedValue = localStorage.getItem(localStorageKey) || DEFAULT_SETTINGS_MODAL[localStorageKey];
            try {
                const parsedValue = JSON.parse(savedValue); // Attempt to parse JSON
                 activeKeybindInput.value = keybindToString(parsedValue); // Update input value
            } catch (e) {
                 // If parsing fails, treat it as a simple string or default
                 activeKeybindInput.value = keybindToString(savedValue !== null ? savedValue : DEFAULT_SETTINGS_MODAL[localStorageKey]);
            }
            activeKeybindInput.classList.remove('listening');
            activeKeybindInput = null;
        }
    }

    function startListening(inputElement, localStorageKey) {
        // Stop any existing listener first
        if (activeKeybindInput && activeKeybindInput !== inputElement) {
             stopListening(activeKeybindInput._currentKeyListener); // Use stored listener reference
        }
         if (activeKeybindInput === inputElement) {
             // If clicking the same input again, stop listening
             stopListening(inputElement._currentKeyListener);
             return;
         }

        activeKeybindInput = inputElement;
        activeKeybindInput.classList.add('listening');
        activeKeybindInput.value = 'Press a key...'; // Change text to indicate listening

        const keyListener = (event) => {
            // Prevent default for all captured events
            event.preventDefault();
            event.stopPropagation();

            const isMouseEvent = event.type === 'mousedown';
            
            // For modifier keys, we'll capture them on keyup instead of keydown
            // This allows distinguishing between "using Shift as modifier" vs "using Shift as the key itself"
            if (event.type === 'keydown') {
                // For keydown, we'll only update the UI to show which modifiers are held
                if (MODIFIERS.includes(event.key)) {
                    const heldModifiers = MODIFIERS.filter(mod => event.getModifierState(mod));
                    activeKeybindInput.value = `Press a key... (${heldModifiers.join('+')})`;
                    return; // Don't capture yet, wait for keyup or another key
                }
                
                // For non-modifier keys, capture immediately on keydown
                const code = event.code;
                const key = event.key;
                // Get currently held modifiers when a non-modifier key is pressed
                const modifiers = MODIFIERS.filter(mod => event.getModifierState(mod));
                
                // Handle Escape specially
                if (key === 'Escape') {
//                     console.log('Escape pressed, canceling keybind capture.');
                    const defaultValue = DEFAULT_SETTINGS_MODAL[localStorageKey];
                    localStorage.setItem(localStorageKey, defaultValue);
                    if (activeKeybindInput) activeKeybindInput.value = keybindToString(defaultValue);
                } else {
//                     console.log('Non-modifier key captured:', { key, code, modifiers });
                    const newKeybind = { key, code, modifiers };
                    localStorage.setItem(localStorageKey, JSON.stringify(newKeybind));
                    if (activeKeybindInput) activeKeybindInput.value = keybindToString(newKeybind);
                }
                // Stop listening after processing a non-modifier keydown
                stopListening(keyListener);
            } 
            else if (event.type === 'keyup') {
                // On keyup, we'll capture standalone modifier keys
                if (MODIFIERS.includes(event.key)) {
                    // Check if only this modifier is pressed (no other modifiers are active)
                    const otherModifiersActive = MODIFIERS.filter(mod => 
                        mod !== event.key && event.getModifierState(mod)
                    ).length > 0;
                    
                    // If no other modifiers are active, use this modifier as the key itself
                    if (!otherModifiersActive) {
//                         console.log('Modifier key captured on keyup:', event.key);
                        const code = event.code;
                        const key = event.key;
                        // No modifiers since this key IS the key, not a modifier for another key
                        const modifiers = [];
                        
                        const newKeybind = { key, code, modifiers };
                        localStorage.setItem(localStorageKey, JSON.stringify(newKeybind));
                        if (activeKeybindInput) activeKeybindInput.value = keybindToString(newKeybind);
                        
                        // Stop listening after capturing a standalone modifier
                        stopListening(keyListener);
                    }
                }
            }
            else if (isMouseEvent) {
                // For mouse events, capture on mousedown
                const code = `Mouse${event.button}`;
                const key = MOUSE_BUTTONS[event.button] ?? code;
                // Get modifiers that are held during the mouse click
                const modifiers = MODIFIERS.filter(mod => event.getModifierState(mod));
                
//                 console.log('Mouse button captured:', { key, code, modifiers });
                const newKeybind = { key, code, modifiers };
                localStorage.setItem(localStorageKey, JSON.stringify(newKeybind));
                if (activeKeybindInput) activeKeybindInput.value = keybindToString(newKeybind);
                
                // Stop listening after processing mousedown
                stopListening(keyListener);
            }
        };

        // Store the listener function reference on the input element
        inputElement._currentKeyListener = keyListener;

        // Add all relevant listeners to the document
        document.addEventListener('keydown', keyListener);
        document.addEventListener('keyup', keyListener); // Add keyup listener for completeness
        document.addEventListener('mousedown', keyListener);
        // Note: mouseup is generally not needed unless capturing clicks with modifier release states, stick to mousedown for simplicity.
    }

    keybindInputsConfig.forEach(item => {
        if (item.el) {
            // Remove existing input listener
            // item.el.removeEventListener('input', () => localStorage.setItem(item.key, item.el.value.trim()));
            // Store the localStorage key directly on the element for easy access in listeners
            item.el.dataset.localStorageKey = item.key;

            item.el.addEventListener('click', (event) => {
                 event.preventDefault(); // Prevent default button click behavior
                 startListening(item.el, item.key);
            });

             // Need to update _loadSettingsToUI to parse the JSON string
             // This will be a separate edit or manual step required.
             // For now, keybinds will appear as raw JSON strings after import/load
        }
    });

    if (showPopupOnHoverCheckbox) {
        showPopupOnHoverCheckbox.addEventListener('change', () => {
//             console.log('showPopupOnHover changed to:', showPopupOnHoverCheckbox.checked);
            localStorage.setItem('showPopupOnHover', showPopupOnHoverCheckbox.checked);
//             console.log('showPopupOnHover saved in localStorage:', localStorage.getItem('showPopupOnHover'));
            
            // Try to access the highlighter in different ways to ensure we can reload config
            if (window.jpHighlighter) {
                if (typeof window.jpHighlighter.reinitialize === 'function') {
//                     console.log('Using reinitialize function for config reload');
                    window.jpHighlighter.reinitialize();
                } else if (typeof window.jpHighlighter.loadConfig === 'function') {
//                     console.log('Using loadConfig function for config reload');
                    const updatedConfig = window.jpHighlighter.loadConfig();
//                     console.log('Highlighter config reloaded after change. Updated showPopupOnHover value:', updatedConfig.showPopupOnHover);
                } else {
                    console.warn('jpHighlighter object exists but no loadConfig or reinitialize method available');
                }
            } else {
                console.warn('Could not reload highlighter config - jpHighlighter object not available');
            }
        });
    }
    if (touchscreenSupportCheckbox) {
        touchscreenSupportCheckbox.addEventListener('change', () => {
            localStorage.setItem('touchscreenSupport', touchscreenSupportCheckbox.checked);
            if (window.jpHighlighter && typeof window.jpHighlighter.loadConfig === 'function') {
                window.jpHighlighter.loadConfig(); // Reload config if it affects highlighter
            }
        });
    }
    if (disableFadeAnimationCheckbox) {
        disableFadeAnimationCheckbox.addEventListener('change', () => {
            localStorage.setItem('disableFadeAnimation', disableFadeAnimationCheckbox.checked);
            if (window.jpHighlighter && typeof window.jpHighlighter.loadConfig === 'function') {
                window.jpHighlighter.loadConfig(); // Reload config as it's used by Popup component via api-adapter
                 // Potentially also directly update popup style if Popup.get().updateStyle() is exposed and needed
                 if (window.jpHighlighter.Popup && window.jpHighlighter.Popup.get) {
                    // This depends on how customPopupCSS is structured and if 'disable-fade-animation' is part of it
                    // For now, loadConfig() should be sufficient as Popup reads from the global config object.
                 }
            }
        });
    }
    if (customPopupCssInput) {
        customPopupCssInput.addEventListener('input', () => {
            localStorage.setItem('customPopupCSS', customPopupCssInput.value);
            if (window.jpHighlighter && typeof window.jpHighlighter.loadConfig === 'function') {
                window.jpHighlighter.loadConfig(); // Reload config
            }
            // Also, directly update the style if the popup instance is accessible and has an update method
            if (window.jpHighlighter.Popup && window.jpHighlighter.Popup.get && typeof window.jpHighlighter.Popup.get().updateStyle === 'function') {
                window.jpHighlighter.Popup.get().updateStyle(customPopupCssInput.value);
//                 console.log('Custom popup CSS updated live.');
            }
        });
    }

    // Listener for Autoload Translations checkbox
    if (autoloadCheckbox && window.storageManager && typeof window.storageManager.saveAutoloadPreference === 'function') {
        autoloadCheckbox.addEventListener('change', () => {
            window.storageManager.saveAutoloadPreference(autoloadCheckbox.checked);
//             console.log('Autoload preference saved:', autoloadCheckbox.checked);
        });
    }

    if (preferDueCardsCheckbox && window.storageManager && typeof window.storageManager.savePreferDueCards === 'function') {
        preferDueCardsCheckbox.addEventListener('change', () => {
            window.storageManager.savePreferDueCards(preferDueCardsCheckbox.checked);
        });
    }

    // Panel Navigation
    if (panelNavButtons && settingPanels) {
        panelNavButtons.forEach(button => {
            button.addEventListener('click', function() {
                panelNavButtons.forEach(btn => btn.classList.remove('active-panel-btn'));
                settingPanels.forEach(panel => panel.classList.remove('active'));
                this.classList.add('active-panel-btn');
                const panelId = this.getAttribute('data-panel');
                document.getElementById(panelId).classList.add('active');
            });
        });
    }

    // Import/Export
    if (exportSettingsBtn) {
        exportSettingsBtn.addEventListener('click', () => {
            const settingsToExport = {};
            const getCookieFuncExport = window.appUtils ? window.appUtils.getCookie : getCookie;
            const getAutoloadPrefFunc = window.storageManager ? window.storageManager.getAutoloadPreference : getAutoloadPreference;
            
            settingsToExport.openai_api_key = getCookieFuncExport('openai_api_key') || '';
            settingsToExport.jpdb_api_key = getCookieFuncExport('jpdb_api_key') || '';
            settingsToExport.openai_model = getCookieFuncExport('openai_model') || serverProvidedDefaultModel || DEFAULT_SETTINGS_MODAL.model;
            settingsToExport.target_language = getCookieFuncExport('target_language') || DEFAULT_SETTINGS_MODAL.language;
            settingsToExport.cefr_index = getCookieFuncExport('cefr_index') || DEFAULT_SETTINGS_MODAL.cefrIndex;
            settingsToExport.userTheme = localStorage.getItem('userTheme') || DEFAULT_SETTINGS_MODAL.userTheme;
            settingsToExport.fontSize = localStorage.getItem('readerUserFontSize') || '16'; // Using the FONT_SIZE_KEY from fontSizeManager
            settingsToExport.autoload_preference = getAutoloadPrefFunc();
            settingsToExport.prefer_due_cards = localStorage.getItem('prefer_due_cards') === 'true';

            const jlptLocalStorageKeys = [
                'jpdbMiningDeckId', 'customWordCSS', 'forqDeckId', 'blacklistDeckId', 
                'neverForgetDeckId', 'contextWidth', 'forqOnMine', 'showPopupKey', 
                'addKey', 'dialogKey', 'blacklistKey', 'neverForgetKey', 'nothingKey', 
                'somethingKey', 'hardKey', 'goodKey', 'easyKey', 'showPopupOnHover', 
                'touchscreenSupport', 'disableFadeAnimation', 'customPopupCSS'
            ];
            jlptLocalStorageKeys.forEach(key => {
                const value = localStorage.getItem(key);
                const defaultValue = DEFAULT_SETTINGS_MODAL[key];
                if (typeof defaultValue === 'boolean') {
                    settingsToExport[key] = value !== null ? (value === 'true') : defaultValue;
                } else {
                    settingsToExport[key] = value !== null ? value : defaultValue;
                }
            });

            const jsonString = JSON.stringify(settingsToExport, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'progressive_reader_settings.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    if (importSettingsBtn) {
        importSettingsBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = e => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = event => {
                        try {
                            const importedSettings = JSON.parse(event.target.result);
                            const setCookieImportFunc = window.appUtils ? window.appUtils.setCookie : setCookie;
                            const saveAutoloadPrefFunc = window.storageManager ? window.storageManager.saveAutoloadPreference : saveAutoloadPreference;
                            const applyThemeImportFunc = window.themeManager ? window.themeManager.applyTheme : applyTheme;
                            const applyCustomWordCssImportFunc = window.customCssManager ? window.customCssManager.applyCustomWordCss : applyCustomWordCss;
                            const applyFontSizeImportFunc = window.fontSizeManager ? window.fontSizeManager.applyFontSize : applyFontSize;

                            if (importedSettings.hasOwnProperty('openai_api_key')) setCookieImportFunc('openai_api_key', importedSettings.openai_api_key);
                            if (importedSettings.hasOwnProperty('jpdb_api_key')) setCookieImportFunc('jpdb_api_key', importedSettings.jpdb_api_key);
                            if (importedSettings.hasOwnProperty('openai_model')) { setCookieImportFunc('openai_model', importedSettings.openai_model); localStorage.setItem('openai_model', importedSettings.openai_model);}
                            if (importedSettings.hasOwnProperty('target_language')) { setCookieImportFunc('target_language', importedSettings.target_language); localStorage.setItem('target_language', importedSettings.target_language);}
                            if (importedSettings.hasOwnProperty('cefr_index')) {setCookieImportFunc('cefr_index', importedSettings.cefr_index); localStorage.setItem('cefr_index', importedSettings.cefr_index);}
                            if (importedSettings.hasOwnProperty('userTheme')) localStorage.setItem('userTheme', importedSettings.userTheme);
                            if (importedSettings.hasOwnProperty('fontSize')) localStorage.setItem('readerUserFontSize', importedSettings.fontSize);
                            if (importedSettings.hasOwnProperty('autoload_preference')) saveAutoloadPrefFunc(importedSettings.autoload_preference);
                            if (importedSettings.hasOwnProperty('prefer_due_cards')) localStorage.setItem('prefer_due_cards', importedSettings.prefer_due_cards);

                            const jlptLocalStorageKeys = [
                                'jpdbMiningDeckId', 'customWordCSS', 'forqDeckId', 'blacklistDeckId', 
                                'neverForgetDeckId', 'contextWidth', 'forqOnMine', 'showPopupKey', 
                                'addKey', 'dialogKey', 'blacklistKey', 'neverForgetKey', 'nothingKey', 
                                'somethingKey', 'hardKey', 'goodKey', 'easyKey', 'showPopupOnHover', 
                                'touchscreenSupport', 'disableFadeAnimation', 'customPopupCSS'
                            ];
                            jlptLocalStorageKeys.forEach(key => {
                                if (importedSettings.hasOwnProperty(key)) {
                                    localStorage.setItem(key, importedSettings[key]);
                                }
                            });

                            _loadSettingsToUI(); 
                            if (themeSelect && applyThemeImportFunc) applyThemeImportFunc(themeSelect.value);
                            if (applyCustomWordCssImportFunc) applyCustomWordCssImportFunc();
                            if (applyFontSizeImportFunc) applyFontSizeImportFunc(parseInt(localStorage.getItem('readerUserFontSize') || '16', 10));
                            
                            const autoloadCheckbox = document.getElementById('autoload-checkbox');
                            if(autoloadCheckbox && window.storageManager) autoloadCheckbox.checked = window.storageManager.getAutoloadPreference();

                            alert('Settings imported successfully!');
                        } catch (error) {
                            console.error('Error importing settings:', error);
                            alert('Failed to import settings. Check console.');
                        }
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        });
    }
}

function initSettingsModal(passedServerDefaultModel) {
    if (passedServerDefaultModel) {
        serverProvidedDefaultModel = passedServerDefaultModel;
        DEFAULT_SETTINGS_MODAL.model = passedServerDefaultModel; // Ensure default also reflects server if nothing is saved
    }
    _selectDOMElements();
    if (!settingsModal) { // Check if primary element exists
        console.warn("Settings modal main element not found. Skipping settings modal initialization.");
        return;
    }
    _loadSettingsToUI();
    _attachEventListeners();
//     console.log("SettingsModal initialized.");
}

window.settingsModalManager = {
    DEFAULT_SETTINGS_MODAL,
    initSettingsModal,
    openSettingsModal,
    closeSettingsModal,
    loadSettingsToUI: _loadSettingsToUI // Expose for potential refresh
};

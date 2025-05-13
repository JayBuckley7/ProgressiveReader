// settingsModal.js

let settingsModal, toggleSettingsBtn, settingsCloseBtn, apiKeyInput, modelSelect, languageSelect, cefrSlider, cefrOutput;
let jpdbApiKeyInput, miningDeckIdInput, customWordCssInput, themeSelect;
let forqDeckIdInput, blacklistDeckIdInput, neverForgetDeckIdInput, contextWidthInput, forqOnMineCheckbox;
let showPopupKeyInput, addKeyInput, dialogKeyInput, blacklistKeyInput, neverForgetKeyInput;
let nothingKeyInput, somethingKeyInput, hardKeyInput, goodKeyInput, easyKeyInput;
let showPopupOnHoverCheckbox, touchscreenSupportCheckbox, disableFadeAnimationCheckbox;
let customPopupCssInput, exportSettingsBtn, importSettingsBtn;
let panelNavButtons, settingPanels;

const CEFR_LEVELS_SETTINGS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_SETTINGS_MODAL = { 
    apiKey: '', 
    // model will be set from serverDefaultModel passed to init or readerInit
    language: 'Spanish', 
    cefrIndex: 3, 
    jpdbApiKey: '', 
    userTheme: 'system',
    miningDeckId: '',
    forqDeckId: '',
    blacklistDeckId: '',
    neverForgetDeckId: '',
    contextWidth: 1,
    forqOnMine: false,
    showPopupKey: 'KeyS',
    addKey: 'KeyA',
    dialogKey: 'KeyD',
    blacklistKey: 'KeyB',
    neverForgetKey: 'KeyN',
    nothingKey: 'Digit1',
    somethingKey: 'Digit2',
    hardKey: 'Digit3',
    goodKey: 'Digit4',
    easyKey: 'Digit5',
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
    if(forqOnMineCheckbox) forqOnMineCheckbox.checked = (localStorage.getItem('forqOnMine') === 'true') || DEFAULT_SETTINGS_MODAL.forqOnMine;

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
    keybindFields.forEach(item => {
        if (item.el) item.el.value = localStorage.getItem(item.key) || DEFAULT_SETTINGS_MODAL[item.key];
    });

    if(showPopupOnHoverCheckbox) showPopupOnHoverCheckbox.checked = (localStorage.getItem('showPopupOnHover') === 'true') || DEFAULT_SETTINGS_MODAL.showPopupOnHover;
    if(touchscreenSupportCheckbox) touchscreenSupportCheckbox.checked = (localStorage.getItem('touchscreenSupport') === 'true') || DEFAULT_SETTINGS_MODAL.touchscreenSupport;
    if(disableFadeAnimationCheckbox) disableFadeAnimationCheckbox.checked = (localStorage.getItem('disableFadeAnimation') === 'true') || DEFAULT_SETTINGS_MODAL.disableFadeAnimation;
    if(customPopupCssInput) customPopupCssInput.value = localStorage.getItem('customPopupCSS') || DEFAULT_SETTINGS_MODAL.customPopupCSS;
    
    _updateCefrOutput();
    _updateJlptToggleVisibility();
    console.log("Settings loaded into UI.");
}

function _attachEventListeners() {
    const setCookieFunc = window.appUtils ? window.appUtils.getCookie : getCookie; // Typo, should be setCookie
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

    if (jpdbApiKeyInput) jpdbApiKeyInput.addEventListener('input', () => { if (window.appUtils) window.appUtils.setCookie('jpdb_api_key', jpdbApiKeyInput.value.trim()); });
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
    keybindInputsConfig.forEach(item => {
        if (item.el) item.el.addEventListener('input', () => localStorage.setItem(item.key, item.el.value.trim()));
    });

    if (showPopupOnHoverCheckbox) showPopupOnHoverCheckbox.addEventListener('change', () => localStorage.setItem('showPopupOnHover', showPopupOnHoverCheckbox.checked));
    if (touchscreenSupportCheckbox) touchscreenSupportCheckbox.addEventListener('change', () => localStorage.setItem('touchscreenSupport', touchscreenSupportCheckbox.checked));
    if (disableFadeAnimationCheckbox) disableFadeAnimationCheckbox.addEventListener('change', () => localStorage.setItem('disableFadeAnimation', disableFadeAnimationCheckbox.checked));
    if (customPopupCssInput) customPopupCssInput.addEventListener('input', () => localStorage.setItem('customPopupCSS', customPopupCssInput.value));

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
    console.log("SettingsModal initialized.");
}

window.settingsModalManager = {
    initSettingsModal,
    openSettingsModal,
    closeSettingsModal,
    loadSettingsToUI: _loadSettingsToUI // Expose for potential refresh
}; 
// hoverSettings.js

// Default values, mirroring settingsModal.js defaults for consistency
const DEFAULT_HOVER_SETTINGS = { 
    jpdbApiKey: '', 
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

// Keys used in localStorage by settingsModal.js
const SETTINGS_KEYS = {
    jpdbApiKey: 'jpdb_api_key', // Stored in cookie
    miningDeckId: 'jpdbMiningDeckId',
    forqDeckId: 'forqDeckId',
    blacklistDeckId: 'blacklistDeckId',
    neverForgetDeckId: 'neverForgetDeckId',
    contextWidth: 'contextWidth',
    forqOnMine: 'forqOnMine',
    showPopupKey: 'showPopupKey',
    addKey: 'addKey',
    dialogKey: 'dialogKey',
    blacklistKey: 'blacklistKey',
    neverForgetKey: 'neverForgetKey',
    nothingKey: 'nothingKey',
    somethingKey: 'somethingKey',
    hardKey: 'hardKey',
    goodKey: 'goodKey',
    easyKey: 'easyKey',
    showPopupOnHover: 'showPopupOnHover',
    touchscreenSupport: 'touchscreenSupport',
    disableFadeAnimation: 'disableFadeAnimation',
    customWordCSS: 'customWordCSS',
    customPopupCSS: 'customPopupCSS'
};

/**
 * Gets a cookie value by name.
 * TODO: Consider moving this to a shared utils or storageManager module.
 * @param {string} name The name of the cookie.
 * @returns {string|null} The cookie value or null if not found.
 */
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

/**
 * Sets a cookie.
 * TODO: Consider moving this to a shared utils or storageManager module.
 * @param {string} name The name of the cookie.
 * @param {string} value The value of the cookie.
 * @param {number} days Days until the cookie expires.
 */
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days*24*60*60*1000));
        expires = "; expires=" + date.toUTCString();
    }
    // Consider adding SameSite=Lax; Secure; attributes if applicable
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}

/**
 * Reads all hover-related settings directly from storage (cookie/localStorage).
 * Uses the keys defined in settingsModal.js for compatibility.
 * @returns {object} An object containing all hover-related settings.
 */
function readHoverSettings() {
    const settings = {};
    const getCookieFunc = window.appUtils?.getCookie || getCookie; // Use utils if available

    for (const [key, storageKey] of Object.entries(SETTINGS_KEYS)) {
        const defaultValue = DEFAULT_HOVER_SETTINGS[key];
        let storedValue;

        if (key === 'jpdbApiKey') {
            storedValue = getCookieFunc(storageKey);
        } else {
            storedValue = localStorage.getItem(storageKey);
        }

        // Handle type conversions and defaults
        if (storedValue === null) {
            settings[key] = defaultValue;
        } else {
            if (typeof defaultValue === 'boolean') {
                settings[key] = (storedValue === 'true');
            } else if (typeof defaultValue === 'number') {
                settings[key] = parseInt(storedValue, 10) || defaultValue; // Use default if parsing fails
            } else {
                settings[key] = storedValue;
            }
        }
    }

    // Parse keybinds from raw strings (simple implementation)
    // TODO: Implement robust keybind parsing (e.g., handling modifiers, multiple keys)
    settings.parsedKeybinds = {};
    const keybindSettingKeys = Object.keys(SETTINGS_KEYS).filter(k => k.endsWith('Key') && k !== 'jpdbApiKey');
    keybindSettingKeys.forEach(key => {
        // For now, just store the raw key code string. Assumes no modifiers.
        settings.parsedKeybinds[key] = settings[key]; 
    });

    return settings;
}

// No save function needed here, as settingsModal.js handles saving via its listeners.
// No setup listener function needed here.
// No populate form function needed here.

// Expose only the read function, as saving/UI is handled by settingsModal.js
window.hoverSettings = {
    readHoverSettings,
    // Provide keys and defaults if needed by other modules
    KEYS: SETTINGS_KEYS,
    DEFAULTS: DEFAULT_HOVER_SETTINGS 
};

console.log("hoverSettings.js loaded (reader only)"); 
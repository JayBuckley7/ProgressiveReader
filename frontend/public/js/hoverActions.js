// hoverActions.js

/**
 * Handles actions triggered by buttons within the hover popup.
 * @param {string} action - The action name (e.g., 'add', 'blacklist', 'review').
 * @param {object} card - The JPDB card object associated with the word.
 * @param {string|null} value - Additional value, e.g., the review rating ('nothing', 'good').
 * @param {string} [context] - The surrounding text context (optional).
 * @param {number} [contextOffset] - The offset within the context (optional).
 */
async function handlePopupAction(action, card, value, context, contextOffset) {

    const settings = window.hoverSettings?.readHoverSettings() || {};
    const apiKey = settings.jpdbApiKey;

    if (!apiKey) {
        alert("JPDB API Key not set in settings.");
        return;
    }

    // TODO: Implement backend API calls based on action
    switch (action) {
        case 'add':
            await _jpdbMineWord(apiKey, card, settings, context, contextOffset);
            break;
        case 'blacklist':
            await _jpdbSetFlag(apiKey, card, 'blacklist', !card.state?.includes('blacklisted'));
            break;
        case 'never-forget':
            await _jpdbSetFlag(apiKey, card, 'never-forget', !card.state?.includes('never-forget'));
            break;
        case 'review':
            if (value) {
                await _jpdbReviewWord(apiKey, card, value);
            }
            break;
        case 'dialog':
            console.warn("Advanced Edit/Review Dialog action not implemented yet.");
            // TODO: Implement dialog logic if needed
            break;
        default:
            console.warn(`Unknown popup action: ${action}`);
    }

    // Optional: Hide popup after action or refresh word state
    window.hoverPopup?.hide(); 
    // TODO: Consider refreshing the specific word span's state/appearance
}

/**
 * Handles actions triggered by keybinds.
 * @param {string} actionName - The name of the keybind action (maps to setting keys like 'addKey', 'blacklistKey').
 * @param {object} card - The JPDB card object for the currently hovered word.
 * @param {string} [context] - The surrounding text context.
 * @param {number} [contextOffset] - The offset within the context.
 */
async function handleKeybindAction(actionName, card, context, contextOffset) {

    const settings = window.hoverSettings?.readHoverSettings() || {};
    const apiKey = settings.jpdbApiKey;

    if (!apiKey && actionName !== 'showPopupKey') { // Allow showPopupKey even without API key
        // Avoid alert for simple hover key if API key isn't needed for it
        if(actionName !== 'showPopupKey') alert("JPDB API Key not set in settings.");
        return;
    }

    // Map actionName (from keybind setting ID) to actual action
    // Assumes actionName is something like 'addKey', 'blacklistKey', 'nothingKey', etc.
    let action = null;
    let value = null;

    if (actionName === 'addKey') action = 'add';
    else if (actionName === 'blacklistKey') action = 'blacklist';
    else if (actionName === 'neverForgetKey') action = 'never-forget';
    else if (actionName === 'dialogKey') action = 'dialog';
    else if (actionName === 'nothingKey') { action = 'review'; value = 'nothing'; }
    else if (actionName === 'somethingKey') { action = 'review'; value = 'something'; }
    else if (actionName === 'hardKey') { action = 'review'; value = 'hard'; }
    else if (actionName === 'goodKey') { action = 'review'; value = 'good'; }
    else if (actionName === 'easyKey') { action = 'review'; value = 'easy'; }

    if (!action) {
        console.warn(`Could not map keybind action name '${actionName}' to a known action.`);
        return;
    }

    // TODO: Implement backend API calls based on action
     switch (action) {
        case 'add':
            await _jpdbMineWord(apiKey, card, settings, context, contextOffset);
            break;
        case 'blacklist':
            await _jpdbSetFlag(apiKey, card, 'blacklist', !card.state?.includes('blacklisted'));
            break;
        case 'never-forget':
            await _jpdbSetFlag(apiKey, card, 'never-forget', !card.state?.includes('never-forget'));
            break;
        case 'review':
            if (value) {
                await _jpdbReviewWord(apiKey, card, value);
            }
            break;
        case 'dialog':
            console.warn("Advanced Edit/Review Dialog action not implemented yet.");
            // TODO: Implement dialog logic
            break;
        default:
            console.warn(`Unknown mapped action: ${action}`);
    }
    
    // Optional: Hide popup after action or refresh word state
    window.hoverPopup?.hide(); 
    // TODO: Consider refreshing the specific word span's state/appearance
}

// --- Placeholder Backend API Call Functions ---

async function _jpdbMineWord(apiKey, card, settings, context, contextOffset) {
    // TODO: Implement API call to backend: POST /api/jpdb/mine
    // Body: { apiKey, vid: card.vid, sid: card.sid, deckId: settings.miningDeckId || null, 
    //         context: context || '', forq: settings.forqOnMine }
    // Handle response (success/failure), maybe update card state locally
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate delay
    // On success, update the local representation if possible
    // card.state = ['learning']; // Example optimistic update
    // Refresh popup? Or just hide?
}

async function _jpdbSetFlag(apiKey, card, flagType, value) {
    // TODO: Implement API call to backend: POST /api/jpdb/set_flag
    // Body: { apiKey, vid: card.vid, sid: card.sid, flag: flagType, value: value }
    // Handle response, maybe update card state locally
    await new Promise(resolve => setTimeout(resolve, 300));
    // Optimistic update:
    // if (value) card.state = [...(card.state || []), flagType];
    // else card.state = (card.state || []).filter(s => s !== flagType);
}

async function _jpdbReviewWord(apiKey, card, rating) {
    // TODO: Implement API call to backend: POST /api/jpdb/review
    // Body: { apiKey, vid: card.vid, sid: card.sid, rating: rating }
    // Handle response, maybe update card state locally
    await new Promise(resolve => setTimeout(resolve, 300));
    // card.state = ['learning']; // Or whatever the state becomes after review
}

// Expose action handlers
window.hoverActions = {
    handlePopupAction,
    handleKeybindAction
};


import { Token, Card, CardState } from '../types';
import { showError, Canceled } from '../utils/util';
import { reverseIndex } from './parse';
import { Keybind } from '../types';
import { vocabBank } from '../services/vocabBank';
import { parseOffline } from '../utils/offlineParser';

// Configuration interface
export interface JpHighlighterConfig {
    enabled: boolean;
    apiKey: string;
    contextWidth: number;
    forqOnMine: boolean;
    showPopupOnHover?: boolean;
    useOfflineParser?: boolean;
    miningDeckId?: string | number;
    forqDeckId?: string | number;
    blacklistDeckId?: string | number;
    neverForgetDeckId?: string | number;
    customWordCSS?: string;
    customPopupCSS?: string;
    touchscreenSupport?: boolean;
    disableFadeAnimation?: boolean;

    // Keybinds
    showPopupKey?: Keybind;
    addKey?: Keybind;
    dialogKey?: Keybind;
    blacklistKey?: Keybind;
    neverForgetKey?: Keybind;
    nothingKey?: Keybind;
    somethingKey?: Keybind;
    hardKey?: Keybind;
    goodKey?: Keybind;
    easyKey?: Keybind;
}

// Default configuration
export const defaultConfig: JpHighlighterConfig = {
    enabled: false,
    apiKey: '',
    contextWidth: 1,
    forqOnMine: false,
    showPopupOnHover: true,
    useOfflineParser: false,
    // Initialize keybinds to a default "None" state or specific defaults
    showPopupKey: { code: 'ShiftLeft', modifiers: [] }, // Default from settingsModal.js was 'ShiftLeft' string
    addKey: { code: 'None', modifiers: [] },
    dialogKey: { code: 'None', modifiers: [] },
    blacklistKey: { code: 'None', modifiers: [] },
    neverForgetKey: { code: 'None', modifiers: [] },
    nothingKey: { code: 'None', modifiers: [] },
    somethingKey: { code: 'None', modifiers: [] },
    hardKey: { code: 'None', modifiers: [] },
    goodKey: { code: 'None', modifiers: [] },
    easyKey: { code: 'None', modifiers: [] },
    touchscreenSupport: false,
    disableFadeAnimation: false,
};

// Internal variable to hold the current configuration instance
let currentConfigInstance: JpHighlighterConfig = { ...defaultConfig };

// Function to get the current configuration
export function getCurrentConfig(): JpHighlighterConfig {
    //console.log('[api-adapter] getCurrentConfig called, returning:', JSON.stringify(currentConfigInstance));
    return currentConfigInstance;
}

// Load configuration from cookies/localStorage
export function loadConfig(): JpHighlighterConfig {
    //console.log('[api-adapter] loadConfig called');
    const loadedConfig = { ...defaultConfig }; // Start with defaults
    
    // Load from cookies
    const getCookie = (name: string): string | undefined => {
        console.log(`Attempting to retrieve cookie '${name}'`);
        console.log('All cookies:', document.cookie);
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        console.log(`Parts found for ${name}:`, parts.length);
        if (parts.length === 2) {
            const cookieValue = parts.pop()?.split(';').shift();
            console.log(`Found value for ${name}:`, cookieValue, typeof cookieValue, 'length:', cookieValue?.length || 0);
            return cookieValue;
        }
        console.log(`No cookie found for ${name}`);
        return undefined;
    };
    
    // Try different methods to get the API key
    const apiKeyFromCookie = getCookie('jpdb_api_key');
    console.log('Raw API key from cookie "jpdb_api_key":', apiKeyFromCookie, typeof apiKeyFromCookie);
    
    // Try an alternate cookie name for backward compatibility
    const apiKeyFromAltCookie = getCookie('jpdbApiKey');
    console.log('API key from alternate cookie "jpdbApiKey":', apiKeyFromAltCookie);
    
    // Assign API key with fallbacks
    loadedConfig.apiKey = apiKeyFromCookie || apiKeyFromAltCookie || '';
    console.log('Final loadedConfig.apiKey value:', loadedConfig.apiKey, 'length:', loadedConfig.apiKey.length);
    
    // Load from localStorage
    try {
        loadedConfig.miningDeckId = localStorage.getItem('jpdbMiningDeckId') || localStorage.getItem('jpdb_mining_deck_id') || undefined;
        loadedConfig.forqDeckId = localStorage.getItem('forqDeckId') || localStorage.getItem('jpdb_forq_deck_id') || undefined;
        loadedConfig.blacklistDeckId = localStorage.getItem('blacklistDeckId') || localStorage.getItem('jpdb_blacklist_deck_id') || undefined;
        loadedConfig.neverForgetDeckId = localStorage.getItem('neverForgetDeckId') || localStorage.getItem('jpdb_never_forget_deck_id') || undefined;
        loadedConfig.contextWidth = parseInt(localStorage.getItem('contextWidth') || localStorage.getItem('jpdb_context_width') || '1', 10);
        loadedConfig.forqOnMine = (localStorage.getItem('forqOnMine') === 'true') || (localStorage.getItem('jpdb_forq_on_mine') === 'true');
        
        // Load showPopupOnHover from localStorage - using the key from settingsModal.js
        console.log('LOADING CONFIG - checking showPopupOnHover value in localStorage');
        const showPopupOnHoverStored = localStorage.getItem('showPopupOnHover');
        console.log('Raw value from localStorage:', showPopupOnHoverStored, typeof showPopupOnHoverStored);
        
        // Clear/explicit handling of the boolean value
        if (showPopupOnHoverStored !== null) {
            // Convert string to boolean properly
            loadedConfig.showPopupOnHover = showPopupOnHoverStored === 'true';
            console.log('Setting showPopupOnHover to:', loadedConfig.showPopupOnHover);
        } else {
            // If not found with the direct key, try with 'jpdb_' prefix for backward compatibility or alternate save location
            const showPopupOnHoverStoredPrefixed = localStorage.getItem('jpdb_show_popup_on_hover');
            if (showPopupOnHoverStoredPrefixed !== null) {
                loadedConfig.showPopupOnHover = showPopupOnHoverStoredPrefixed === 'true';
                console.log('Setting showPopupOnHover from prefixed key to:', loadedConfig.showPopupOnHover);
            } else {
                console.log('Using default showPopupOnHover value:', loadedConfig.showPopupOnHover);
            }
        }

        // Load keybind settings from localStorage
        const keybindKeys = ['showPopupKey', 'addKey', 'dialogKey', 'blacklistKey', 'neverForgetKey', 
                           'nothingKey', 'somethingKey', 'hardKey', 'goodKey', 'easyKey'];
        
        keybindKeys.forEach(keybindKey => {
            const storedValue = localStorage.getItem(keybindKey);
            if (storedValue) {
                try {
                    // Try to parse as JSON first (new format)
                    const parsedKeybind = JSON.parse(storedValue);
                    console.log(`Loading keybind ${keybindKey} from localStorage:`, parsedKeybind);
                    
                    // Convert to the format expected by the Keybind interface
                    if (parsedKeybind) {
                        if (parsedKeybind === 'None' || parsedKeybind.code === 'None') {
                            // Handle 'None' case
                            (loadedConfig as any)[keybindKey] = { code: 'None', modifiers: [] };
                        } else {
                            // Use the parsed keybind, ensuring it has the required properties for Keybind interface
                            // parsedKeybind has {key, code, modifiers} but we only need {code, modifiers}
                            (loadedConfig as any)[keybindKey] = {
                                code: parsedKeybind.code,
                                modifiers: parsedKeybind.modifiers || []
                            };
                        }
                    }
                } catch (e) {
                    // If not JSON or parsing fails, treat as a legacy string value
                    console.log(`Keybind ${keybindKey} is in legacy format:`, storedValue);
                    
                    // For legacy string, assume it's just the code with no modifiers
                    if (storedValue === 'None') {
                        (loadedConfig as any)[keybindKey] = { code: 'None', modifiers: [] };
                    } else {
                        (loadedConfig as any)[keybindKey] = { code: storedValue, modifiers: [] };
                    }
                }
            } else {
                // Leave as undefined to get default fallback when spread in the next step
                console.log(`No stored value for ${keybindKey}, using default`);
            }
        });

        loadedConfig.customWordCSS = localStorage.getItem('customWordCSS') || localStorage.getItem('jpdb_custom_word_css') || undefined;
        loadedConfig.customPopupCSS = localStorage.getItem('customPopupCSS') || localStorage.getItem('jpdb_custom_popup_css') || undefined;
        loadedConfig.touchscreenSupport = localStorage.getItem('touchscreenSupport') === 'true' || false;
        loadedConfig.useOfflineParser = localStorage.getItem('useOfflineParser') === 'true' || false;
    } catch (e) {
        console.error('Error loading configuration from localStorage:', e);
    }
    
    // Update the internal config instance with the newly loaded values
    // Ensure that all properties from loadedConfig are spread, 
    // and then explicitly overwrite with defaults ONLY if a loadedConfig property is truly undefined.
    // This handles cases where a loaded value might be, e.g., `false` for a boolean, which is valid and not undefined.
    currentConfigInstance = { 
        ...defaultConfig, // Start with all defaults
        ...loadedConfig   // Spread loaded values, overwriting defaults
    };

    // Special handling for keybinds: if a keybind was not in localStorage, 
    // loadedConfig[keybindKey] would be undefined. The spread above handles this by keeping the default.
    // If it *was* in localStorage and parsed to { code: 'None', ... }, that will correctly override a different default.

    console.log('[api-adapter] loadConfig finished, currentConfigInstance is now:', JSON.stringify(currentConfigInstance, null, 2));
    return currentConfigInstance; // Return the new config instance
}

// Parse text using JPDB API
export async function parseText(textSegments: string[]): Promise<Token[]> {
    const currentConfig = getCurrentConfig(); // Get current config
    try {
        console.log('parseText called with', textSegments.length, 'segments');

        if (currentConfig.useOfflineParser || !currentConfig.apiKey) {
            const text = textSegments.join(' ');
            const tokens = await parseOffline(text);
            vocabBank.updateFromTokens(tokens);
            return tokens;
        }
        
        console.log(`Sending ${textSegments.length} text segments to JPDB API. API Key exists:`, !!currentConfig.apiKey);
        
        const response = await fetch('/api/get_jpdb_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text_segments: textSegments, 
                jpdb_api_key: currentConfig.apiKey 
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || `JPDB API Error: ${response.status}`;
            } catch (e) {
                // In case it's not JSON
                errorMessage = `JPDB API Error: ${response.status}. Response: ${errorText}`;
            }
            console.error('API response error:', errorMessage);
            throw new Error(errorMessage);
        }
        
        const tokens: Token[] = await response.json();
        if (tokens && (tokens as any).error) {
            console.error('Error in tokens response:', (tokens as any).error);
            throw new Error((tokens as any).error);
        }
        if (!tokens || !Array.isArray(tokens)) {
            console.error('Invalid token data received:', tokens);
            throw new Error("Invalid token data.");
        }
        
        console.log(`Received ${tokens.length} tokens from API`);
        
        // Log some sample tokens for debugging
        if (tokens.length > 0) {
            console.log('Sample token:', JSON.stringify(tokens[0]));
        }

        // Update vocabulary bank
        vocabBank.updateFromTokens(tokens);

        return tokens;
    } catch (error) {
        console.error('Error in parseText:', error);
        showError(error instanceof Error ? error : String(error));
        throw new Canceled('Parsing canceled due to error');
    }
}

// Mine a word to JPDB
export async function mineWord(card: Card, forq: boolean, sentence?: string): Promise<boolean> {
    const currentConfig = getCurrentConfig(); // Get current config
    try {
        if (!currentConfig.apiKey) {
            throw new Error('JPDB API Key is not set. Please set it in settings.');
        }
        
        // This would need to be implemented on the server side
        const response = await fetch('/api/mine_jpdb_word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vid: card.vid,
                sid: card.sid,
                forq: forq,
                sentence: sentence,
                jpdb_api_key: currentConfig.apiKey,
                mining_deck_id: currentConfig.miningDeckId,
                forq_deck_id: currentConfig.forqDeckId
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `JPDB Mining Error: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success) {
            vocabBank.markSaved(card);
        }
        return result.success;
    } catch (error) {
        showError(error instanceof Error ? error : String(error));
        return false;
    }
}

// Update word state (e.g., blacklist, never-forget)
export async function updateWordState(card: Card, flag: 'blacklist' | 'never-forget' | 'forq', state: boolean): Promise<boolean> {
    const currentConfig = getCurrentConfig(); // Get current config
    try {
        if (!currentConfig.apiKey) {
            throw new Error('JPDB API Key is not set. Please set it in settings.');
        }
        
        // This would need to be implemented on the server side
        const response = await fetch('/api/update_jpdb_word_state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vid: card.vid,
                sid: card.sid,
                flag: flag,
                state: state,
                jpdb_api_key: currentConfig.apiKey,
                blacklist_deck_id: currentConfig.blacklistDeckId,
                never_forget_deck_id: currentConfig.neverForgetDeckId,
                forq_deck_id: currentConfig.forqDeckId
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `JPDB State Update Error: ${response.status}`);
        }
        
        const result = await response.json();

        // Update the UI if successful
        if (result.success && result.newState) {
            updateUIForCard(card, result.newState);
            if (flag === 'never-forget' && state) {
                vocabBank.markMastered(card);
            }
        }

        return result.success;
    } catch (error) {
        showError(error instanceof Error ? error : String(error));
        return false;
    }
}

// Review a card
export async function reviewCard(card: Card, rating: string): Promise<boolean> {
    const currentConfig = getCurrentConfig(); // Get current config
    try {
        if (!currentConfig.apiKey) {
            throw new Error('JPDB API Key is not set. Please set it in settings.');
        }
        
        // This would need to be implemented on the server side
        const response = await fetch('/api/review_jpdb_card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vid: card.vid,
                sid: card.sid,
                rating: rating,
                jpdb_api_key: currentConfig.apiKey
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `JPDB Review Error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Update the UI if successful
        if (result.success && result.newState) {
            updateUIForCard(card, result.newState);
        }
        
        return result.success;
    } catch (error) {
        showError(error instanceof Error ? error : String(error));
        return false;
    }
}

// Helper function to update UI for a card
function updateUIForCard(card: Card, newState: CardState) {
    const idx = reverseIndex.get(`${card.vid}/${card.sid}`);
    if (!idx) return;
    
    const className = `jpdb-word ${newState.join(' ')}`;
    if (idx.className === className) return;
    
    for (const element of idx.elements) {
        element.className = className;
        element.jpdbData.token.card.state = newState;
    }
    
    idx.className = className;
} 
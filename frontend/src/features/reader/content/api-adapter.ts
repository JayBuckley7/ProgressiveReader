import { Token, Card, CardState } from '~/types';
import { Canceled } from '@shared/utils/util';
import { notifyError } from '@shared/utils/notify';
import { appLog } from '@shared/appLog';
import { reverseIndex } from './parse.tsx';
import { Keybind } from '~/types';
import { vocabBank } from '@features/vocabulary/services/vocabBank';
import { parseWithLocalLookup } from '@features/reader/utils/localTextParser';
import type { VocabularyBackendPort } from '@core/backend/ports';

export type JpdbApiPort = Pick<
    VocabularyBackendPort,
    'getJpdbData' | 'mineJpdbWord' | 'updateJpdbWordState' | 'reviewJpdbCard'
>;

// Helper function to convert string[] to CardState
function toCardState(state: string[]): CardState {
    if (state.length === 0) return ['not-in-deck'] as CardState;
    return state as CardState;
}



// Configuration interface
export interface JpHighlighterConfig {
    enabled: boolean;
    apiKey: string;
    contextWidth: number;
    forqOnMine: boolean;
    showPopupOnHover?: boolean;
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
    return currentConfigInstance;
}

// Load configuration from cookies/localStorage
export function loadConfig(): JpHighlighterConfig {
    const loadedConfig = { ...defaultConfig }; // Start with defaults
    
    // Load from cookies
    const getCookie = (name: string): string | undefined => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return parts.pop()?.split(';').shift();
        }
        return undefined;
    };
    
    // Try different methods to get the API key
    const apiKeyFromCookie = getCookie('jpdb_api_key');
    
    // Try an alternate cookie name for backward compatibility
    const apiKeyFromAltCookie = getCookie('jpdbApiKey');
    
    // Assign API key with fallbacks
    loadedConfig.apiKey = apiKeyFromCookie || apiKeyFromAltCookie || '';
    
    // Load from localStorage
    try {
        loadedConfig.miningDeckId = localStorage.getItem('jpdbMiningDeckId') || localStorage.getItem('jpdb_mining_deck_id') || undefined;
        loadedConfig.forqDeckId = localStorage.getItem('forqDeckId') || localStorage.getItem('jpdb_forq_deck_id') || undefined;
        loadedConfig.blacklistDeckId = localStorage.getItem('blacklistDeckId') || localStorage.getItem('jpdb_blacklist_deck_id') || undefined;
        loadedConfig.neverForgetDeckId = localStorage.getItem('neverForgetDeckId') || localStorage.getItem('jpdb_never_forget_deck_id') || undefined;
        loadedConfig.contextWidth = parseInt(localStorage.getItem('contextWidth') || localStorage.getItem('jpdb_context_width') || '1', 10);
        loadedConfig.forqOnMine = (localStorage.getItem('forqOnMine') === 'true') || (localStorage.getItem('jpdb_forq_on_mine') === 'true');
        
        // Load showPopupOnHover from localStorage - using the key from settingsModal.js
        const showPopupOnHoverStored = localStorage.getItem('showPopupOnHover');
        
        // Clear/explicit handling of the boolean value
        if (showPopupOnHoverStored !== null) {
            // Convert string to boolean properly
            loadedConfig.showPopupOnHover = showPopupOnHoverStored === 'true';
        } else {
            // If not found with the direct key, try with 'jpdb_' prefix for backward compatibility or alternate save location
            const showPopupOnHoverStoredPrefixed = localStorage.getItem('jpdb_show_popup_on_hover');
            if (showPopupOnHoverStoredPrefixed !== null) {
                loadedConfig.showPopupOnHover = showPopupOnHoverStoredPrefixed === 'true';
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
                    // For legacy string, assume it's just the code with no modifiers
                    if (storedValue === 'None') {
                        (loadedConfig as any)[keybindKey] = { code: 'None', modifiers: [] };
                    } else {
                        (loadedConfig as any)[keybindKey] = { code: storedValue, modifiers: [] };
                    }
                }
            } else {
                // Leave as undefined to get default fallback when spread in the next step
            }
        });

        loadedConfig.customWordCSS = localStorage.getItem('customWordCSS') || localStorage.getItem('jpdb_custom_word_css') || undefined;
        loadedConfig.customPopupCSS = localStorage.getItem('customPopupCSS') || localStorage.getItem('jpdb_custom_popup_css') || undefined;
        loadedConfig.touchscreenSupport = localStorage.getItem('touchscreenSupport') === 'true' || false;
    } catch (e) {
        appLog.warn('[loadConfig] Failed to load configuration from localStorage', e);
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

    return currentConfigInstance; // Return the new config instance
}

// Parse text using JPDB API
export async function parseText(api: JpdbApiPort, textSegments: string[]): Promise<Token[]> {
    const currentConfig = getCurrentConfig(); // Get current config
    try {
        if (!currentConfig.apiKey) {
            // Keep segment concatenation aligned with how we compute global offsets for highlighting (no separator).
            const text = textSegments.join('');
            const tokens = await parseWithLocalLookup(text);
            vocabBank.updateFromTokens(tokens);
            return tokens;
        }
        
        const processedTokens = await api.getJpdbData({
            text_segments: textSegments,
            jpdb_api_key: currentConfig.apiKey,
        });
        
        // Convert ProcessedToken[] to Token[]
        const tokens: Token[] = processedTokens.map((pt) => ({
            start: pt.start,
            end: pt.end,
            length: pt.length,
            rubies: pt.rubies.map((r) => ({
                text: r.text,
                start: r.start,
                end: r.end,
                length: r.length,
            })),
            card: pt.card as Card, // Assuming card structure matches
        }));

        // Update vocabulary bank
        vocabBank.updateFromTokens(tokens);

        return tokens;
    } catch (error) {
        notifyError(error, { title: 'JPDB parsing error' });
        throw new Canceled('Parsing canceled due to error');
    }
}

// Mine a word to JPDB
export async function mineWord(api: JpdbApiPort, card: Card, forq: boolean, sentence?: string): Promise<boolean> {
    const currentConfig = getCurrentConfig(); // Get current config
    try {
        if (!currentConfig.apiKey) {
            throw new Error('JPDB API Key is not set. Please set it in settings.');
        }
        
        const result = await api.mineJpdbWord({
            vid: card.vid,
            sid: card.sid,
            forq: forq,
            sentence: sentence,
            jpdb_api_key: currentConfig.apiKey,
            mining_deck_id: typeof currentConfig.miningDeckId === 'string' ? parseInt(currentConfig.miningDeckId) : currentConfig.miningDeckId,
            forq_deck_id: typeof currentConfig.forqDeckId === 'string' ? parseInt(currentConfig.forqDeckId) : currentConfig.forqDeckId,
        });
        
        if (result.success) {
            vocabBank.markSaved(card);
        }
        return result.success;
    } catch (error) {
        notifyError(error, { title: 'JPDB mining error' });
        return false;
    }
}

// Update word state (e.g., blacklist, never-forget)
export async function updateWordState(
    api: JpdbApiPort,
    card: Card,
    flag: 'blacklist' | 'never-forget' | 'forq',
    state: boolean
): Promise<boolean> {
    const currentConfig = getCurrentConfig(); // Get current config
    try {
        if (!currentConfig.apiKey) {
            throw new Error('JPDB API Key is not set. Please set it in settings.');
        }
        
        const result = await api.updateJpdbWordState({
            vid: card.vid,
            sid: card.sid,
            flag: flag,
            state: state,
            jpdb_api_key: currentConfig.apiKey,
            blacklist_deck_id: typeof currentConfig.blacklistDeckId === 'string' ? parseInt(currentConfig.blacklistDeckId) : currentConfig.blacklistDeckId,
            never_forget_deck_id: typeof currentConfig.neverForgetDeckId === 'string' ? parseInt(currentConfig.neverForgetDeckId) : currentConfig.neverForgetDeckId,
            forq_deck_id: typeof currentConfig.forqDeckId === 'string' ? parseInt(currentConfig.forqDeckId) : currentConfig.forqDeckId,
        });

        // Update the UI if successful. Our backend currently returns a coarse
        // newState (e.g. 'known'/'new') and does not reflect flags such as
        // 'blacklisted' or 'never-forget'. We therefore predict the flagged
        // state locally for immediate visual feedback.
        if (result.success) {
            const baseState = (result.newState && Array.isArray(result.newState))
                ? result.newState.slice()
                : (card.state ? card.state.slice() : []);

            const nextStateSet = new Set<string>(baseState);
            if (flag === 'blacklist') {
                if (state) nextStateSet.add('blacklisted');
                else nextStateSet.delete('blacklisted');
            } else if (flag === 'never-forget') {
                if (state) nextStateSet.add('never-forget');
                else nextStateSet.delete('never-forget');
            }

            const nextState = Array.from(nextStateSet);
            updateUIForCard(card, toCardState(nextState));

            if (flag === 'never-forget' && state) {
                vocabBank.markMastered(card);
            }
        }

        return result.success;
    } catch (error) {
        notifyError(error, { title: 'JPDB update error' });
        return false;
    }
}

// Review a card
export async function reviewCard(api: JpdbApiPort, card: Card, rating: string): Promise<boolean> {
    const currentConfig = getCurrentConfig(); // Get current config
    try {
        if (!currentConfig.apiKey) {
            throw new Error('JPDB API Key is not set. Please set it in settings.');
        }
        
        const result = await api.reviewJpdbCard({
            vid: card.vid,
            sid: card.sid,
            rating: rating as any,
            jpdb_api_key: currentConfig.apiKey,
        });
        
        // Update the UI if successful
        if (result.success && result.newState) {
            updateUIForCard(card, toCardState(result.newState));
        }
        
        return result.success;
    } catch (error) {
        notifyError(error, { title: 'JPDB review error' });
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

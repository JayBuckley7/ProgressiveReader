// Import dependencies - no direct CSS import needed
import { displayCategory, Fragment, Paragraph, applyTokens, setWordHoverHandlers } from './content/parse';
import { getCurrentConfig, loadConfig, parseText, JpHighlighterConfig } from './content/api-adapter';
import { JpdbWord, getJpdbData } from './content/word';
import { nonNull } from './utils/util';
import { showError } from './components/toast';
import { Popup } from './components/popup';
import { Keybind } from './types'; // Corrected import path for Keybind
import Logger from './utils/logger';

let currentHover: [JpdbWord, number, number] | null = null;
let popupKeyHeld = false; // Add popupKeyHeld state
let highlightApplied = false; // Track if highlighting has been applied
let storedContentElement: HTMLElement | null = null; // Element to highlight on demand

// Initialize logger debug state from a global flag if present
Logger.setDebug((window as any).jpHighlighterDebug === true);

// Use the imported config, explicitly typed
let config: JpHighlighterConfig = getCurrentConfig(); // Change const to let so we can reassign

// Helper to check if event matches a hotkey
function matchesHotkey(event: KeyboardEvent | MouseEvent, hotkey: Keybind | undefined): boolean {
    const eventType = event.type;
    const eventCode = event instanceof KeyboardEvent ? event.code : `Mouse${event.button}`;
    Logger.log(`matchesHotkey called with event type: ${eventType}, code: ${eventCode}`);
    
    if (!hotkey) {
        Logger.log('No hotkey provided, returning false');
        return false;
    }
    
    Logger.log('Checking against hotkey:', hotkey);
    
    if (hotkey.code === 'None') {
        Logger.log("Hotkey code is 'None', returning false");
        return false; // No binding if code is 'None'
    }
    
    const code = event instanceof KeyboardEvent ? event.code : `Mouse${event.button}`;
    
    // Check modifiers
    const modifiersMatch = (hotkey.modifiers || []).every((name: string) => { 
        const isModifierPressed = 
            (name === 'Control' && event.ctrlKey) ||
            (name === 'Shift' && event.shiftKey) ||
            (name === 'Alt' && event.altKey) ||
            (name === 'Meta' && event.metaKey);
            
        Logger.log(`Checking modifier ${name}: required=${true}, pressed=${isModifierPressed}`);
        return isModifierPressed;
    });
    
    const allModifiersMatch = 
        (hotkey.modifiers || []).length === 0 || // No modifiers required
        modifiersMatch;
    
    // Extra check: if hotkey requires no modifiers, ensure no modifiers are pressed
    const noExtraModifiers = (hotkey.modifiers || []).length === 0 ? 
        !(event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) : true;
    
    // Log active modifiers if any
    const activeModifiers = [];
    if (event.ctrlKey) activeModifiers.push('Control');
    if (event.shiftKey) activeModifiers.push('Shift');
    if (event.altKey) activeModifiers.push('Alt');
    if (event.metaKey) activeModifiers.push('Meta');
    
    Logger.log(`Active modifiers: [${activeModifiers.join(', ')}]`);
    Logger.log(`Code match: ${code === hotkey.code}, modifiers match: ${allModifiersMatch}, no extra modifiers: ${noExtraModifiers}`);
    
    // Match if codes match and either modifiers match (if any required) or no modifiers required and none pressed
    const result = code === hotkey.code && allModifiersMatch;
    Logger.log(`matchesHotkey result: ${result}`);
    return result;
}

// Wait for the browser to load all CSS before starting
function waitForCSS(): Promise<void> {
    return new Promise(resolve => {
        if (document.styleSheets.length > 0) {
            resolve();
            return;
        }
        
        const intervalId = setInterval(() => {
            if (document.styleSheets.length > 0) {
                clearInterval(intervalId);
                resolve();
            }
        }, 10);
    });
}

// Extract text segments from a DOM element
function extractCleanTextSegments(rootElement: HTMLElement): string[] {
    const segments: string[] = [];
    let currentSegmentText = '';

    function flushCurrentSegment() {
        const trimmedSegment = currentSegmentText.trim();
        if (trimmedSegment.length > 0) {
            segments.push(trimmedSegment);
        }
        currentSegmentText = '';
    }

    function processNode(node: Node) {
        const category = displayCategory(node);
        switch (category) {
            case 'text':
                currentSegmentText += node.textContent;
                break;
            case 'inline':
            case 'ruby': // Treat ruby as inline for text concatenation within a segment
                Array.from(node.childNodes).forEach(processNode);
                break;
            case 'block':
                flushCurrentSegment(); // Finalize current segment before processing block's children
                Array.from(node.childNodes).forEach(processNode); // Process children of the block
                flushCurrentSegment(); // Finalize any text found within/after the block
                break;
            case 'ruby-text': // Ruby text (furigana) should not be part of the main text sent for parsing
            case 'none':
                break;
            default:
                // If unknown, try to process children if it's an element
                if (node.nodeType === Node.ELEMENT_NODE) {
                    Array.from(node.childNodes).forEach(processNode);
                }
                break;
        }
    }

    if (rootElement && rootElement.childNodes) {
        Array.from(rootElement.childNodes).forEach(processNode);
    }
    flushCurrentSegment(); // Finalize any remaining text at the end

    // Filter out any truly empty strings that might have resulted, though flushCurrentSegment tries to avoid them.
    return segments.filter(s => s.length > 0);
}

// Create paragraph fragments from DOM element
function createParagraphFragments(contentElement: HTMLElement): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    let currentParagraph: Fragment[] = [];
    let globalOffset = 0;
    
    // This is a simplified version that doesn't handle all edge cases
    function processNode(node: Node) {
        const category = displayCategory(node);
        
        if (category === 'text') {
            const textContent = node.textContent || '';
            if (textContent.trim() !== '') {
                const length = textContent.length;
                currentParagraph.push({
                    start: globalOffset,
                    end: globalOffset + length,
                    length,
                    node: node as Text,
                    hasRuby: false
                });
                globalOffset += length;
            }
        } else if (category === 'inline' || category === 'ruby') {
            Array.from(node.childNodes).forEach(processNode);
        } else if (category === 'block') {
            if (currentParagraph.length > 0) {
                paragraphs.push([...currentParagraph]);
                currentParagraph = [];
            }
            Array.from(node.childNodes).forEach(processNode);
            if (currentParagraph.length > 0) {
                paragraphs.push([...currentParagraph]);
                currentParagraph = [];
            }
        }
    }
    
    processNode(contentElement);
    
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
    }
    
    return paragraphs;
}

// Main function to apply JPDB highlighting to a content element
export async function highlightContent(contentElement: HTMLElement): Promise<void> {
    Logger.log('highlightContent called', contentElement);
    
    let currentConfig = loadConfig(); // Load config, it updates the instance in api-adapter and returns it
    Logger.log('Config loaded/updated in highlightContent:', JSON.stringify(currentConfig, null, 2));
    Logger.log('API Key exists:', !!currentConfig.apiKey, 'API Key value length:', currentConfig.apiKey?.length || 0);
    Logger.log('API Key empty check (!currentConfig.apiKey):', !currentConfig.apiKey);
    
    const directCookieCheck = document.cookie.includes('jpdb_api_key=') && 
                             document.cookie.split('jpdb_api_key=')[1]?.split(';')[0]?.trim();
    
    if (!currentConfig.apiKey || currentConfig.apiKey.length === 0) {
        console.error('JPDB API Key is not set in config');
        if (directCookieCheck) {
            Logger.log('Found API key directly in cookie, attempting to use it and reload config');
            // This scenario is less likely now with centralized config, but as a safeguard:
            // Manually setting and reloading could be an option, but loadConfig should handle it.
            // For now, we rely on loadConfig having done its job. If key is still missing, alert.
             alert('JPDB API Key is not set. Please set it in settings. Attempted to load from cookie.');
            return;
        } else {
            alert('JPDB API Key is not set. Please set it in settings.');
            return;
        }
    }
    
    // Store original content for later restoration
    // Only set data-original-content if it hasn't been set already
    // This allows the calling component (BookReader) to set the appropriate content
    // (e.g., translated content when highlighting translations)
    if (!contentElement.getAttribute('data-original-content')) {
        const originalContent = contentElement.innerHTML;
        contentElement.setAttribute('data-original-content', originalContent);
        Logger.log('Stored original content for restoration');
    } else {
        Logger.log('data-original-content already set, preserving existing value');
    }
    
    try {
        const textSegments = extractCleanTextSegments(contentElement);
        Logger.log(`Extracted ${textSegments.length} text segments`);
        
        if (!textSegments || textSegments.length === 0) {
            Logger.log('No text segments to highlight.');
            return;
        }
        
        document.body.style.cursor = 'wait';
        const paragraphs = createParagraphFragments(contentElement); // Fragments have global offsets
        Logger.log(`Created ${paragraphs.length} paragraph fragments`);
        
        Logger.log('About to parse text with API...');
        const tokens = await parseText(textSegments); // Tokens have global offsets

        Logger.log(`Received ${tokens.length} tokens from API`);
        console.log('🔍 Sample tokens:', tokens.slice(0, 3).map(t => ({
            start: t.start, 
            end: t.end, 
            spelling: t.card?.spelling,
            state: t.card?.state
        })));
        
        for (const paragraph of paragraphs) { // A paragraph is a Fragment[]
            if (paragraph.length > 0) {
                const globalParagraphStartOffset = paragraph[0].start;
                const globalParagraphEndOffset = paragraph[paragraph.length - 1].end;

                // Filter tokens that are relevant to this paragraph using global offsets
                const relevantGlobalTokens = tokens.filter(token => {
                    return token.start < globalParagraphEndOffset && token.end > globalParagraphStartOffset;
                });

                if (relevantGlobalTokens.length > 0) {
                    // Make token offsets relative to this paragraph's start
                    const relativeTokens = relevantGlobalTokens.map(token => ({
                        ...token,
                        card: { ...token.card }, // Deep copy card object
                        rubies: token.rubies.map(r => ({...r})), // Deep copy rubies array
                        start: Math.max(0, token.start - globalParagraphStartOffset),
                        end: Math.min(globalParagraphEndOffset - globalParagraphStartOffset, token.end - globalParagraphStartOffset),
                    })).map(token => ({
                        ...token,
                        // Ensure length is recalculated based on new relative start/end
                        length: token.end - token.start 
                    })); 

                    // Make fragment offsets relative to this paragraph's start for applyTokens
                    const relativeFragments = paragraph.map(frag => ({
                        ...frag,
                        start: frag.start - globalParagraphStartOffset,
                        end: frag.end - globalParagraphStartOffset,
                    }));
                    
                    if (relativeFragments.length > 0 && relativeTokens.length > 0) {
                        // Debug logging of first fragment/token
                        Logger.log(
                            `Processing paragraph. Global start: ${globalParagraphStartOffset}. Relative Fragments (first):`,
                            JSON.stringify(relativeFragments[0]),
                            'Relative Tokens (first):',
                            JSON.stringify(relativeTokens[0])
                        );
                        
                        console.log('🔍 About to call applyTokens with:', {
                            relativeFragments: relativeFragments.length,
                            relativeTokens: relativeTokens.length,
                            firstFragmentText: relativeFragments[0]?.node?.data,
                            firstTokenSpelling: relativeTokens[0]?.card?.spelling
                        });
                    }

                    applyTokens(relativeFragments, relativeTokens);
                    console.log('🔍 applyTokens call completed for this paragraph');
                }
            }
        }
    } catch (error) {
        console.error('Error in highlightContent:', error);
        showError(error instanceof Error ? error : new Error(String(error)));
        contentElement.innerHTML = originalContent;
    } finally {
        document.body.style.cursor = 'default';
    }
}

// Word hover handlers
function onWordHoverStart(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    const jpdbWordElement = target.closest('.jpdb-word') as JpdbWord | null;
    if (!jpdbWordElement) return;

    // Store hover information regardless of whether we show the popup
    currentHover = [jpdbWordElement, event.clientX, event.clientY];
    
    // Only show popup on hover if the setting is enabled OR the popup key is held
    const currentConfig = getCurrentConfig(); // Get latest config
    console.log('🔔 onWordHoverStart triggered');
    console.log('🔔 showPopupOnHover from config:', currentConfig.showPopupOnHover);
    console.log('🔔 popupKeyHeld:', popupKeyHeld);
    console.log('🔔 localStorage showPopupOnHover:', localStorage.getItem('showPopupOnHover'));
    
    if (currentConfig.showPopupOnHover || popupKeyHeld) {
        console.log('🔔 Will show popup because:', currentConfig.showPopupOnHover ? 'hover is enabled' : 'popup key is held');
        const jpdbData = getJpdbData(jpdbWordElement);
        console.log('🔔 jpdbData:', jpdbData);
        if (jpdbData) {
            // Set jpdbData for compatibility with existing code
            if (!('jpdbData' in jpdbWordElement)) {
                (jpdbWordElement as any).jpdbData = jpdbData;
            }
            console.log('🔔 Calling Popup.get().showForWord()');
            Popup.get().showForWord(jpdbWordElement, event.clientX, event.clientY);
        } else {
            console.error('🔔 JpdbWord element is missing jpdbData on hover!', jpdbWordElement);
        }
    } else {
        console.log('🔔 Not showing popup: hover is disabled and key is not held');
    }
}

function onWordHoverStop(): void {
    currentHover = null;
    // Do NOT call fadeOut here based on jpd-breader logic
}

// Global keydown listener for hotkeys
function globalKeydownListener(event: KeyboardEvent) {
    const currentConfig = getCurrentConfig(); // Get latest config for keybinds
    // Check for the show popup key specifically
    if (matchesHotkey(event, currentConfig.showPopupKey)) {
        event.preventDefault(); // Prevent default browser behavior
        popupKeyHeld = true;
        Popup.get().disablePointer(); // Disable pointer events on popup while key is held

        if (!highlightApplied && storedContentElement) {
            highlightApplied = true;
            highlightContent(storedContentElement);
        }

        // If a word is already hovered, show the popup immediately
        if (currentHover) {
            const [wordElement, x, y] = currentHover;
            const jpdbData = getJpdbData(wordElement);
        if (jpdbData) {
            // Set jpdbData for compatibility with existing code
            if (!('jpdbData' in wordElement)) {
                (wordElement as any).jpdbData = jpdbData;
            }
                Logger.log('Showing popup because popup key was pressed while hovering a word');
                Popup.get().showForWord(wordElement, x, y);
            }
        }
    }
    
    // Future: Add more hotkey handling here for other actions (like in the inspiration code)
    // if (currentHover) {
    //    const [wordElement, x, y] = currentHover;
    //    if (matchesHotkey(event, config.addKey)) { /* handle adding word */ }
    //    if (matchesHotkey(event, config.dialogKey)) { /* show dialog */ }
    //    // etc.
    // }
}

// Global keyup listener
function globalKeyupListener(event: KeyboardEvent) {
    const currentConfig = getCurrentConfig(); // Get latest config for keybinds
    // Check for the show popup key
    if (matchesHotkey(event, currentConfig.showPopupKey)) {
        event.preventDefault();
        popupKeyHeld = false;
        Popup.get().enablePointer(); // Re-enable pointer events
        
        // If hover popups are disabled, hide the popup when key is released
        // Add a small delay to allow clicks within the popup after key release
        if (!currentConfig.showPopupOnHover && Popup.get().isVisible) {
            setTimeout(() => {
                // Double check popupKeyHeld state hasn't changed during timeout
                if (!popupKeyHeld) {
                    Logger.log('Hiding popup because popup key was released and hover is disabled');
                    Popup.get().fadeOut();
                }
            }, 100); // Small delay
        }
    }
}

// Main initialization function
export async function initialize(contentElement: HTMLElement): Promise<void> {
    console.log('🏗️ initialize() called');
    try {
        await waitForCSS();
        let currentConfig = loadConfig(); // Initial config load
        storedContentElement = contentElement;
        console.log('🏗️ About to call setWordHoverHandlers');
        setWordHoverHandlers(onWordHoverStart, onWordHoverStop);
        console.log('🏗️ setWordHoverHandlers completed');

        // Add global key listeners for hotkeys
        window.addEventListener('keydown', globalKeydownListener);
        window.addEventListener('keyup', globalKeyupListener);

        // Add global mousedown listener to hide popup (replicating jpd-breader)
        document.addEventListener('mousedown', (event) => {
            const popup = Popup.get(); // Get the singleton instance
            const latestConfig = getCurrentConfig(); // Get latest config for this check
            // Check if the click is outside the popup AND not a right-click (context menu)
            // And consider touchscreen support logic
             if (!popup.containsMouse(event) && event.button !== 2) { // event.button 2 is right-click
                 if (latestConfig.touchscreenSupport) {
                     // On touchscreen, click outside should hide, but only if not hovering a word
                     // (to avoid issues with the initial touch triggering both hover and hide)
                     if (!currentHover) {
                        popup.fadeOut();
                     }
                 } else {
                     // On desktop, any click outside hides
                     popup.fadeOut();
                 }
             }
        });

        // Define a reinitialization function that will be called when settings change
        const reinitialize = () => {
            Logger.log('[index.ts] reinitialize called. Calling loadConfig.');
            loadConfig(); // Call loadConfig to update the central instance in api-adapter
            // No need to assign to a local variable here if other functions use getCurrentConfig()
            Logger.log('[index.ts] reinitialize: loadConfig completed. Current config from getCurrentConfig() is now:', JSON.stringify(getCurrentConfig()));
        };

        // Properly expose the module interface to global scope
        window.jpHighlighter = {
            ...window.jpHighlighter, // Preserve any existing properties
            initialize, // Expose initialize function
            loadConfig, // Direct access to loadConfig
            getCurrentConfig, // Expose getCurrentConfig
            reinitialize, // Specific function to reload config when settings change
            wireUpToggle, // Use the actual wireUpToggle function
            highlightContent, // Use the actual highlightContent function
            setDebug: Logger.setDebug, // Allow toggling debug logging
            Popup // Expose the Popup for direct access if needed
        };

        // Apply custom CSS if provided (from original logic)
        const initialConfig = getCurrentConfig(); // Get config for applying styles
        if (initialConfig.customWordCSS) {
            const styleElement = document.createElement('style');
            styleElement.id = 'jp-highlighter-custom-word-css';
            styleElement.textContent = initialConfig.customWordCSS;
            document.head.appendChild(styleElement);
        }
        
        if (initialConfig.customPopupCSS) {
            const styleElement = document.createElement('style');
            styleElement.id = 'jp-highlighter-custom-popup-css';
            styleElement.textContent = initialConfig.customPopupCSS;
            document.head.appendChild(styleElement);
        }
        
        Logger.log('JP Highlighter initialized with global mousedown listener for popup.');
    } catch (error) {
        showError(error instanceof Error ? error : new Error(String(error)));
    }
}

// Wire up the existing toggle checkbox
export function wireUpToggle(contentElement: HTMLElement): void {
    const toggleCheckbox = document.getElementById('jlpt-highlighting') as HTMLInputElement;
    if (!toggleCheckbox) {
        console.warn('JLPT toggle checkbox not found');
        return;
    }
    
    // DO NOT set data-original-content here. 
    // It should be set by highlightContent when it's actually about to modify the content,
    // or if we explicitly want to save the state before the first highlight operation triggered by the toggle.
    // const originalContent = contentElement.innerHTML; 
    // contentElement.setAttribute('data-original-content', originalContent);
    
    toggleCheckbox.addEventListener('change', async function() {
        const isEnabled = this.checked;
        
        try {
            // Update server state
            const response = await fetch('/api/toggle_jlpt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: isEnabled })
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (isEnabled) {
                    // highlightContent will handle setting data-original-content if it's not already set
                    // and if it's operating on stable content due to the deferral logic in jlptHighlighter.js.
                    await highlightContent(contentElement);
                } else {
                    // Remove highlighting by restoring original content
                    const savedContent = contentElement.getAttribute('data-original-content');
                    if (savedContent) {
                        contentElement.innerHTML = savedContent;
                    }
                }
            } else {
                alert('Error saving JLPT highlighting preference.');
                this.checked = !isEnabled;
            }
        } catch (error) {
            showError(error instanceof Error ? error : new Error(String(error)));
            this.checked = !isEnabled;
        }
    });
}

// Export module
export default {
    initialize,
    highlightContent,
    wireUpToggle,
    loadConfig,
    getCurrentConfig,
    setDebug: Logger.setDebug,
    Popup
};

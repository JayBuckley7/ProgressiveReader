// JPDB Highlighter Initialization Service
import { displayCategory, Fragment, Paragraph, applyTokens, setWordHoverHandlers, reverseIndex } from '@features/reader/content/parse';
import { getCurrentConfig, loadConfig, parseText, type JpdbApiPort } from '@features/reader/content/api-adapter';
import { JpdbWord, getJpdbData, getSentences } from '@features/reader/content/word';
import { notifyError } from '@shared/utils/notify';
import { showDefinitionPopup, hideDefinitionPopup } from '@features/reader/components/JpdbPopup';
import { Keybind } from '~/types';
import { appLog } from '@shared/appLog';

let currentHover: [JpdbWord, number, number] | null = null;
let popupKeyHeld = false; // Add popupKeyHeld state

// Track initialization state and event listener references
let isInitialized = false;

export function setDebug(flag: boolean): void {
    appLog.setLevel(flag ? 'debug' : 'warn');
}

// Helper to check if event matches a hotkey
function matchesHotkey(event: KeyboardEvent | MouseEvent, hotkey: Keybind | undefined): boolean {
    if (!hotkey) {
        return false;
    }

    if (hotkey.code === 'None') {
        return false; // No binding if code is 'None'
    }

    const code = event instanceof KeyboardEvent ? event.code : `Mouse${event.button}`;
    if (code !== hotkey.code) return false;

    const required = hotkey.modifiers || [];
    if (required.length === 0 && (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey)) {
        return false;
    }

    const modifiersOk = required.every((name: string) => {
        switch (name) {
            case 'Control':
                return !!event.ctrlKey;
            case 'Shift':
                return !!event.shiftKey;
            case 'Alt':
                return !!event.altKey;
            case 'Meta':
                return !!event.metaKey;
            default:
                return false;
        }
    });

    if (modifiersOk) {
        appLog.debug('[jpdb] Hotkey matched', { code, modifiers: required });
    }

    return modifiersOk;
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

// Extract text segments from a DOM element - ALIGNED with fragment extraction
function extractCleanTextSegments(rootElement: HTMLElement): string[] {
    const MAX_SEGMENT_CHARS = 3000; // keep segments safely below JPDB byte limit
    const segments: string[] = [];
    let current = '';

    function pushCurrentIfAny(): void {
        if (current.length === 0) return;
        if (current.length <= MAX_SEGMENT_CHARS) {
            segments.push(current);
        } else {
            let start = 0;
            while (start < current.length) {
                const end = Math.min(current.length, start + MAX_SEGMENT_CHARS);
                segments.push(current.slice(start, end));
                start = end;
            }
        }
        current = '';
    }

    function appendText(text: string): void {
        if (text.length === 0) return;
        let remaining = text;
        while (remaining.length > 0) {
            const spaceLeft = MAX_SEGMENT_CHARS - current.length;
            if (spaceLeft <= 0) {
                segments.push(current);
                current = '';
                continue;
            }
            if (remaining.length <= spaceLeft) {
                current += remaining;
                break;
            } else {
                current += remaining.slice(0, spaceLeft);
                segments.push(current);
                current = '';
                remaining = remaining.slice(spaceLeft);
            }
        }
    }

    function processNode(node: Node) {
        const category = displayCategory(node);
        if (category === 'text') {
            const textContent = node.textContent || '';
            if (textContent.trim() !== '') {
                appendText(textContent);
            }
        } else if (category === 'inline' || category === 'ruby') {
            Array.from(node.childNodes).forEach(processNode);
        } else if (category === 'block') {
            // Flush before and after blocks to create paragraph-like segments
            pushCurrentIfAny();
            Array.from(node.childNodes).forEach(processNode);
            pushCurrentIfAny();
        }
    }

    processNode(rootElement);
    pushCurrentIfAny();

    return segments;
}

// Create paragraph fragments from DOM element
function createParagraphFragments(contentElement: HTMLElement): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    let currentParagraph: Fragment[] = [];
    let globalOffset = 0;
    
    // This is a simplified version that doesn't handle all edge cases
    function processNode(node: Node, inRuby: boolean) {
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
                    hasRuby: inRuby
                });
                globalOffset += length;
            }
        } else if (category === 'inline') {
            Array.from(node.childNodes).forEach((child) => processNode(child, inRuby));
        } else if (category === 'ruby') {
            Array.from(node.childNodes).forEach((child) => processNode(child, true));
        } else if (category === 'block') {
            if (currentParagraph.length > 0) {
                paragraphs.push([...currentParagraph]);
                currentParagraph = [];
            }
            Array.from(node.childNodes).forEach((child) => processNode(child, inRuby));
            if (currentParagraph.length > 0) {
                paragraphs.push([...currentParagraph]);
                currentParagraph = [];
            }
        }
    }
    
    processNode(contentElement, false);
    
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
    }
    
    return paragraphs;
}

export function removeJpdbHighlighting(contentElement: HTMLElement): void {
    try {
        reverseIndex.clear();

        // Remove any injected ruby text (furigana) nodes inside jpdb wrappers.
        const injectedRt = contentElement.querySelectorAll('.jpdb-word rt');
        injectedRt.forEach((node) => node.parentNode?.removeChild(node));

        // Unwrap all JPDB wrappers, restoring original text nodes.
        const wrappers = Array.from(contentElement.querySelectorAll('.jpdb-word'));
        for (const wrapper of wrappers) {
            const parent = wrapper.parentNode;
            if (!parent) continue;
            while (wrapper.firstChild) {
                parent.insertBefore(wrapper.firstChild, wrapper);
            }
            parent.removeChild(wrapper);
        }

        if (contentElement.normalize) {
            contentElement.normalize();
        }
    } catch (error) {
        appLog.error('[jpdb] Error removing highlighting', error);
    }
}

// Main function to apply JPDB highlighting to a content element
export async function highlightContent(api: JpdbApiPort, contentElement: HTMLElement): Promise<void> {
    appLog.debug('[jpdb] highlightContent');

    // Ensure the DOM is clean before applying highlights (prevents nesting on re-run).
    removeJpdbHighlighting(contentElement);
    
    // CRITICAL: Set hover handlers FIRST, before any DOM processing
    setWordHoverHandlers(onWordHoverStart, onWordHoverStop);
    
    const currentConfig = loadConfig(); // Load config, it updates the instance in api-adapter and returns it

    appLog.debug('[jpdb] highlight config', { hasApiKey: !!currentConfig.apiKey });

    if (!currentConfig.apiKey || currentConfig.apiKey.length === 0) {
        // Do not abort here. parseText() will handle local translation fallback when no API key
        // is configured.
    }
    
    try {
        const renderVersionAtStart = contentElement.dataset.prRenderVersion ?? null;
        const textSegments = extractCleanTextSegments(contentElement);

        appLog.debug('[jpdb] extracted text segments', { count: textSegments.length });
        
        if (!textSegments || textSegments.length === 0) {
            appLog.debug('[jpdb] no text segments to highlight');
            return;
        }
        
        document.body.style.cursor = 'wait';
        
        const paragraphs = createParagraphFragments(contentElement); // Fragments have global offsets
        appLog.debug('[jpdb] created paragraph fragments', { count: paragraphs.length });

        const tokens = await parseText(api, textSegments); // Tokens have global offsets

        // If the reader rerendered while we were awaiting tokens, offsets no longer match the DOM.
        // This can happen when quickly adjusting mix aggression. In that case, skip applying.
        const renderVersionNow = contentElement.dataset.prRenderVersion ?? null;
        if (!contentElement.isConnected || renderVersionAtStart !== renderVersionNow) {
            appLog.debug('[jpdb] skipping highlight apply (stale render version)', {
                renderVersionAtStart,
                renderVersionNow,
                isConnected: contentElement.isConnected,
            });
            return;
        }

        appLog.debug('[jpdb] received tokens', { count: tokens.length });
        
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
                        applyTokens(relativeFragments, relativeTokens);
                    }
                }
            }
        }

    } catch (error) {
        appLog.error('[jpdb] Error in highlightContent', error);
        notifyError(error, { title: 'JPDB highlight error' });
        // Attempt to rollback any partial highlighting.
        removeJpdbHighlighting(contentElement);
    } finally {
        document.body.style.cursor = 'default';
    }
}

// Word hover handlers
function onWordHoverStart(event: MouseEvent): void {
    try {
        const target = event.target as HTMLElement;
        if (!target) return;

        const jpdbWordElement = target.closest('.jpdb-word') as JpdbWord | null;
        if (!jpdbWordElement) return;

        // Store hover information regardless of whether we show the popup
        currentHover = [jpdbWordElement, event.clientX, event.clientY];
        
        const isClick = event.type === 'click';

        // Only show popup on hover if the setting is enabled OR the popup key is held.
        // Always show on click/tap.
        const currentConfig = getCurrentConfig();
        
        if (!isClick && !(currentConfig.showPopupOnHover || popupKeyHeld)) return;

        const jpdbData = getJpdbData(jpdbWordElement);
        if (!jpdbData) return;

        // jpdbData has structure: { token: Token, context: string, contextOffset: number }
        const sentence = getSentences(jpdbData, currentConfig.contextWidth);
        const displayWord = jpdbData.token?.card?.spelling || jpdbWordElement.textContent || '';
        const wordData = {
            token: jpdbData.token,
            position: jpdbData.contextOffset,
            sentence,
        };

        if (isClick) {
            showDefinitionPopup(displayWord, jpdbWordElement, wordData, { pin: true });
        } else {
            showDefinitionPopup(
                displayWord,
                { x: event.clientX, y: event.clientY },
                wordData,
                { sourceElement: jpdbWordElement }
            );
        }
    } catch (error) {
        appLog.error('[jpdb] Error in onWordHoverStart', error);
    }
}

function onWordHoverStop(event?: MouseEvent): void {
    currentHover = null;
    
    // Hide popup when hover stops, unless popup key is held
    const currentConfig = getCurrentConfig();
    if (currentConfig.showPopupOnHover && !popupKeyHeld) {
        // Use the new hover intent system with proper delays
        hideDefinitionPopup();
    }
}

// Global keydown listener for hotkeys
function globalKeydownListener(event: KeyboardEvent) {
    const currentConfig = getCurrentConfig(); // Get latest config for keybinds
    // Check for the show popup key specifically
    if (matchesHotkey(event, currentConfig.showPopupKey)) {
        event.preventDefault(); // Prevent default browser behavior
        popupKeyHeld = true;

        // If a word is already hovered, show the popup immediately.
        if (currentHover) {
            const [wordElement, x, y] = currentHover;
            const jpdbData = getJpdbData(wordElement);
            if (jpdbData) {
                appLog.debug('[jpdb] Showing popup from hotkey while hovering');
                const sentence = getSentences(jpdbData, currentConfig.contextWidth);
                const displayWord = jpdbData.token?.card?.spelling || wordElement.textContent || '';
                const wordData = {
                    token: jpdbData.token, // Extract the actual token from jpdbData
                    position: jpdbData.contextOffset,
                    sentence
                };
                showDefinitionPopup(displayWord, { x, y }, wordData, { sourceElement: wordElement });
            }
        }
    }
}

// Global keyup listener
function globalKeyupListener(event: KeyboardEvent) {
    const currentConfig = getCurrentConfig(); // Get latest config for keybinds
    // Check for the show popup key
    if (matchesHotkey(event, currentConfig.showPopupKey)) {
        event.preventDefault();
        popupKeyHeld = false;
        
        // If hover popups are disabled, hide the popup when key is released
        if (!currentConfig.showPopupOnHover) {
            hideDefinitionPopup();
        }
    }
}

// Main initialization function
export async function initialize(contentElement: HTMLElement): Promise<void> {
    // If already initialized, just update config and skip event listener setup
    if (isInitialized) {
        loadConfig(); // Update config
        return;
    }
    
    try {
        await waitForCSS();
        loadConfig(); // Initial config load

        // Remove existing event listeners to prevent duplicates
        window.removeEventListener('keydown', globalKeydownListener);
        window.removeEventListener('keyup', globalKeyupListener);

        // Add global key listeners for hotkeys
        window.addEventListener('keydown', globalKeydownListener);
        window.addEventListener('keyup', globalKeyupListener);

        // Mark as initialized to prevent duplicate event listeners
        isInitialized = true;

        // Define a reinitialization function that will be called when settings change
        const reinitialize = () => {
            appLog.debug('[jpdb] Reinitialize: reloading config');
            loadConfig(); // Call loadConfig to update the central instance in api-adapter
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
        
        appLog.debug('[jpdb] Highlighter initialized');
    } catch (error) {
        notifyError(error, { title: 'JPDB highlighter error' });
    }
}

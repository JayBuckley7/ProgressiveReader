// wordHoverManager.js
// Convert to ES module format

const WORD_HOVER_CLASS = 'pr-hoverable-word';
let currentHoveredWordElement = null;
let currentSettings = {};
let contentArea = null; // The DOM element containing the text to be processed
let originalContent = ''; // To store the content before processing, for reverting
let isHoverFeatureActive = false; // Global toggle for the feature
let popupKeyHeld = false; // Tracks if the configured popup key is being held

/**
 * Initializes the Word Hover Manager.
 * @param {HTMLElement} targetContentArea - The DOM element to process for hover popups.
 * @param {boolean} initiallyEnabled - Whether the feature should be active on load.
 */
function initWordHoverManager(targetContentArea, initiallyEnabled = true) {
    if (!targetContentArea) {
        console.error("WordHoverManager: Target content area not provided.");
        return;
    }
    contentArea = targetContentArea;
    originalContent = contentArea.innerHTML; // Save original content for disabling

    // Load initial settings
    currentSettings = window.hoverSettings?.readHoverSettings() || {};
    console.log("WordHoverManager initialized with settings:", currentSettings);

    if (initiallyEnabled) {
        activateHoverFeature();
    } else {
        deactivateHoverFeature();
    }

    _setupGlobalKeyListeners();

    // TODO: Listen for settings changes to dynamically update behavior
    // (e.g., if custom CSS changes, or keybinds are updated)
    // window.addEventListener('settingsUpdated', (event) => { // Custom event from settingsModal
    //     currentSettings = window.hoverSettings.readHoverSettings();
    //     if (isHoverFeatureActive) {
    //         // Potentially re-apply word CSS or update key listeners
    //         applyCustomWordStyling(currentSettings.customWordCSS); 
    //     }
    // });

    console.log("Word Hover Manager initialized.");
}

/**
 * Activates the hover feature: parses text, applies markup, and enables listeners.
 */
async function activateHoverFeature() {
    if (!contentArea) {
        console.error("WordHoverManager: Content area not set. Cannot activate.");
        return;
    }
    isHoverFeatureActive = true;
    console.log("Activating hover feature...");

    // 1. Get current settings (in case they changed)
    currentSettings = window.hoverSettings?.readHoverSettings() || {};

    // 2. Extract text segments (adapted from jlptHighlighter.js)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentArea.innerHTML; // Use current content in case it was modified
    const textSegments = _extractCleanTextSegments(tempDiv);

    if (!textSegments || textSegments.length === 0) {
        console.log("WordHoverManager: No text segments to process.");
        isHoverFeatureActive = false; // Nothing to do
        return;
    }

    // 3. Send to backend for parsing (placeholder)
    document.body.style.cursor = 'wait';
    try {
        const tokens = await _fetchWordTokens(textSegments, currentSettings.jpdbApiKey);
        if (!tokens || tokens.error) {
            throw new Error(tokens?.error || "Failed to fetch or parse word tokens.");
        }

        // 4. Apply tokens to DOM (wrap words, store data, add listeners)
        _applyWordTokensToDOM(tokens);

        // 5. Apply custom word styling from settings
        applyCustomWordStyling(currentSettings.customWordCSS);

    } catch (error) {
        console.error('Error activating hover feature:', error);
        // Optionally, revert to original content or show a user-facing error
        // contentArea.innerHTML = originalContent; 
        isHoverFeatureActive = false;
    } finally {
        document.body.style.cursor = 'default';
    }
    console.log("Hover feature activated.");
}

/**
 * Deactivates the hover feature: removes markup and listeners.
 */
function deactivateHoverFeature() {
    isHoverFeatureActive = false;
    if (contentArea) {
        // A simple way to remove is to restore original content.
        // More sophisticated would be to find and unwrap only our spans.
        contentArea.innerHTML = originalContent;
    }
    window.hoverPopup?.hide(); // Hide popup if it was visible
    // Remove global key listeners specific to the feature if any were dynamically added
    // (currently _setupGlobalKeyListeners adds them once, so they persist)
    console.log("Hover feature deactivated. Content restored.");
}

async function _fetchWordTokens(textSegments, apiKey) {
    console.log(`Fetching word tokens for ${textSegments.length} segments from /api/jpdb_hover_data`);
    if (!apiKey) {
        console.warn("JPDB API Key not provided to _fetchWordTokens. Backend may require it.");
        // Depending on backend, this might be an error or it might allow anonymous parsing without user data.
        // For now, we proceed, but the backend will likely error if it needs the key.
    }

    try {
        const response = await fetch('/api/jpdb_hover_data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                text_segments: textSegments,
                jpdb_api_key: apiKey
            })
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                // If parsing JSON fails, use text as fallback
                errorData = { error: response.statusText || 'Failed to fetch hover data' };
            }
            console.error('Error fetching word tokens:', response.status, errorData);
            // Throw an error that includes the backend's message if available
            throw new Error(errorData.error || `HTTP error ${response.status}`); 
        }

        const tokens = await response.json();
        console.log("Received tokens from backend:", tokens);
        // The backend should already return tokens in the format:
        // [{ start, end, text, token: { card: {...} } }, ...]
        // If not, transformation would be needed here.
        return tokens;

    } catch (error) {
        console.error('Error in _fetchWordTokens:', error);
        // Propagate the error so it can be handled by the caller (activateHoverFeature)
        // and potentially display a message to the user.
        throw error; 
    }
}

/**
 * Applies parsed word tokens to the DOM, wrapping words in spans and attaching listeners.
 * Adapted from jlptHighlighter.js and jpd-breader's applyTokens.
 * @param {object[]} tokens - Array of token objects from the backend.
 */
function _applyWordTokensToDOM(tokens) {
    if (!tokens || tokens.length === 0 || !contentArea) return;

    // Sort tokens by start offset, just in case
    tokens.sort((a, b) => (a.start || 0) - (b.start || 0));

    let currentDocTextOffset = 0;
    let tokenIndex = 0;
    const treeWalker = document.createTreeWalker(contentArea, NodeFilter.SHOW_TEXT, null, false);
    let textNode;
    const nodesToProcessLater = []; // To avoid issues with modifying DOM while traversing TreeWalker

    while (tokenIndex < tokens.length && (textNode = treeWalker.nextNode())) {
        const nodeText = textNode.nodeValue || '';
        const nodeLength = nodeText.length;
        const nodeEndDocTextOffset = currentDocTextOffset + nodeLength;

        // Skip tokens that are entirely before the current text node
        while (tokenIndex < tokens.length && (tokens[tokenIndex].end || 0) <= currentDocTextOffset) {
            tokenIndex++;
        }
        if (tokenIndex >= tokens.length) break;

        let currentToken = tokens[tokenIndex];
        let lastProcessedOffsetInNode = 0;
        const newChildrenForParent = [];

        // Iterate through tokens that might overlap with the current text node
        while (tokenIndex < tokens.length && (currentToken.start || 0) < nodeEndDocTextOffset) {
            currentToken = tokens[tokenIndex];
            if (currentToken.start === undefined || currentToken.end === undefined) { // Skip invalid tokens
                tokenIndex++; continue;
            }
            
            const tokenStartInNode = Math.max(0, currentToken.start - currentDocTextOffset);
            const tokenEndInNode = Math.min(nodeLength, currentToken.end - currentDocTextOffset);

            if (tokenStartInNode < tokenEndInNode) { // Token overlaps with this node
                // Add preceding text if any
                if (tokenStartInNode > lastProcessedOffsetInNode) {
                    newChildrenForParent.push(document.createTextNode(nodeText.substring(lastProcessedOffsetInNode, tokenStartInNode)));
                }

                // Create and add the word span
                const span = document.createElement('span');
                span.className = WORD_HOVER_CLASS;
                // Add state classes if available (e.g., known, learning)
                currentToken.token?.card?.state?.forEach(s => span.classList.add(s.toLowerCase()));
                
                const wordText = nodeText.substring(tokenStartInNode, tokenEndInNode);
                span.appendChild(document.createTextNode(wordText));

                // Store token data on the span (use dataset for stringifiable, direct for objects)
                // span.dataset.wordData = JSON.stringify(currentToken); // If all data is simple
                span.jpdbData = currentToken; // Store the whole token object

                newChildrenForParent.push(span);
                lastProcessedOffsetInNode = tokenEndInNode;

                // If this token ends within this node, move to the next token
                if (currentToken.end <= nodeEndDocTextOffset) {
                    tokenIndex++;
                } else {
                    // Token spans across this node and onto the next, break to process next text node
                    break;
                }
            } else if (currentToken.end <= currentDocTextOffset) { // Token is before current node (should have been caught by outer while)
                 tokenIndex++;
            } else { // Token is after the current node or doesn't overlap meaningfully
                break; 
            }
        }

        // Add any remaining text from this node after the last token
        if (lastProcessedOffsetInNode < nodeLength) {
            newChildrenForParent.push(document.createTextNode(nodeText.substring(lastProcessedOffsetInNode)));
        }

        // If the node was changed, schedule its replacement
        if (newChildrenForParent.length > 0 && !(newChildrenForParent.length === 1 && newChildrenForParent[0].nodeType === Node.TEXT_NODE && newChildrenForParent[0].nodeValue === nodeText)) {
            nodesToProcessLater.push({ original: textNode, replacements: newChildrenForParent });
        }
        currentDocTextOffset += nodeLength;
    }

    // Perform DOM manipulations after TreeWalker is done
    nodesToProcessLater.forEach(item => {
        const parent = item.original.parentNode;
        if (parent) {
            item.replacements.forEach(newNode => parent.insertBefore(newNode, item.original));
            parent.removeChild(item.original);
        }
    });

    // Now that spans are in DOM, attach event listeners to them
    _attachHoverListenersToSpans();
}

function _attachHoverListenersToSpans() {
    const wordSpans = contentArea.querySelectorAll('.' + WORD_HOVER_CLASS);
    wordSpans.forEach(span => {
        span.addEventListener('mouseenter', handleWordMouseEnter);
        span.addEventListener('mouseleave', handleWordMouseLeave);
    });
}

function handleWordMouseEnter(event) {
    if (!isHoverFeatureActive) return;

    const targetSpan = event.currentTarget;
    currentHoveredWordElement = targetSpan;
    const wordData = targetSpan.jpdbData; // Retrieve stored data

    if (wordData && (currentSettings.showPopupOnHover || popupKeyHeld)) {
        if (window.hoverPopup) {
            window.hoverPopup.show(wordData, targetSpan, event.clientX, event.clientY, currentSettings);
        }
    }
}

function handleWordMouseLeave(event) {
    if (!isHoverFeatureActive) return;
    
    currentHoveredWordElement = null;
    // Only hide if popup key isn't held (unless mouse is over popup itself)
    if (!popupKeyHeld && window.hoverPopup && !window.hoverPopup.contains(event.relatedTarget)) { 
        window.hoverPopup.hide();
    }
}

/**
 * Sets up global key listeners for keybinds (show popup key, actions).
 */
function _setupGlobalKeyListeners() {
    document.addEventListener('keydown', (event) => {
        if (!isHoverFeatureActive) return;

        // Handle 'Show Popup Key' (if configured)
        if (currentSettings.parsedKeybinds?.showPopupKey && event.code === currentSettings.parsedKeybinds.showPopupKey) {
            if (!popupKeyHeld && currentHoveredWordElement) { // Show on keydown if word already hovered
                const wordData = currentHoveredWordElement.jpdbData;
                if (wordData && window.hoverPopup && !window.hoverPopup.isVisible) {
                     window.hoverPopup.show(wordData, currentHoveredWordElement, event.clientX, event.clientY, currentSettings);
                }
            }
            popupKeyHeld = true;
            // Prevent default if this keybind is meant to do something specific here (e.g. Ctrl+S to save)
            // event.preventDefault(); 
        }

        // Handle other action keybinds (add, blacklist, review, etc.)
        if (currentHoveredWordElement?.jpdbData?.token?.card) {
            const card = currentHoveredWordElement.jpdbData.token.card;
            const context = currentHoveredWordElement.jpdbData.context;
            const contextOffset = currentHoveredWordElement.jpdbData.contextOffset;
            let actionHandled = false;

            for (const [actionName, keyCode] of Object.entries(currentSettings.parsedKeybinds || {})) {
                if (actionName === 'showPopupKey') continue; // Already handled

                if (event.code === keyCode) {
                    console.log(`Keybind triggered: ${actionName} for word:`, card.spelling);
                    if (window.hoverActions && typeof window.hoverActions.handleKeybindAction === 'function') {
                        window.hoverActions.handleKeybindAction(actionName, card, context, contextOffset);
                        actionHandled = true;
                        event.preventDefault(); // Prevent default browser action for this keybind
                        break;
                    }
                }
            }
            // If an action was handled, maybe hide the popup or give feedback
            // if (actionHandled && window.hoverPopup) window.hoverPopup.hide(); 
        }
    });

    document.addEventListener('keyup', (event) => {
        if (!isHoverFeatureActive) return;

        if (currentSettings.parsedKeybinds?.showPopupKey && event.code === currentSettings.parsedKeybinds.showPopupKey) {
            popupKeyHeld = false;
            // If not configured to show on hover, and mouse is not over popup, hide it when key is released
            if (!currentSettings.showPopupOnHover && window.hoverPopup && window.hoverPopup.isVisible) {
                if (!window.hoverPopup.contains(event.target)) { // Check if mouse isn't over popup itself
                     // Small delay to allow clicking on popup content if key was released while over it
                    setTimeout(() => { if(!popupKeyHeld) window.hoverPopup.hide(); }, 100);
                }
            }
        }
    });

    // Listener for clicks outside the popup to hide it
    document.addEventListener('mousedown', (event) => {
        if (!isHoverFeatureActive || !window.hoverPopup || !window.hoverPopup.isVisible) return;

        const popupElement = document.getElementById('progressive-reader-hover-popup');
        if (popupElement && !popupElement.contains(event.target) && currentHoveredWordElement !== event.target && !currentHoveredWordElement?.contains(event.target)) {
            // Only hide if showPopupOnHover is false and popupKey isn't held,
            // OR if touchscreen support is enabled (where clicks often dismiss popups)
            // OR if the click is definitively outside an active word span
            if ((!currentSettings.showPopupOnHover && !popupKeyHeld) || currentSettings.touchscreenSupport) {
                 window.hoverPopup.hide();
            }
        }
    });
}

/**
 * Extracts clean text segments from a root DOM element.
 * Ignores script, style, and other non-content tags.
 * Tries to respect block boundaries by creating separate segments.
 * Ruby content is handled to extract base text primarily.
 * (Adapted from existing jlptHighlighter.js)
 */
function _getElementDisplayCategory(node) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
        if (!node.nodeValue || node.nodeValue.trim() === "") return 'ignore'; 
        return 'text';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'MAP', 'AREA', 'HEAD', 'META', 'LINK'].includes(tagName)) {
            return 'ignore';
        }
        if (tagName === 'BR') return 'block_br';
        if (tagName === 'HR') return 'ignore';

        if (tagName === 'RUBY') return 'ruby_container';
        if (tagName === 'RT') return 'ruby_text_content'; // Should be ignored for main text extraction
        if (tagName === 'RP') return 'ruby_punctuation'; // Usually ignored or handled by ruby_container
        if (tagName === 'RB') return 'ruby_base_content'; // This is what we want from ruby

        // Common block tags
        const blockTags = [
            'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 
            'MAIN', 'HEADER', 'FOOTER', 'NAV', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'DL', 
            'DT', 'DD', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'FIELDSET', 
            'FORM', 'ADDRESS', 'FIGURE', 'FIGCAPTION'];
        if (blockTags.includes(tagName)) return 'block';

        // Common inline tags (that contain text or other inlines)
        const inlineTags = [
            'SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'SUB', 'SUP', 'CODE', 
            'VAR', 'SAMP', 'KBD', 'Q', 'CITE', 'DFN', 'ABBR', 'TIME', 'MARK', 'SMALL', 'BIG'];
        if (inlineTags.includes(tagName)) return 'inline';
        
        // Tags to generally ignore for text extraction
        if (['IMG', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LABEL'].includes(tagName)) return 'ignore';

        // Default for unknown elements: treat as inline to process children
        // console.warn(`_getElementDisplayCategory: Unknown tag ${tagName}. Treating as 'inline'.`);
        return 'inline'; 
    } else {
        return 'ignore'; // Comments, processing instructions, etc.
    }
}

function _extractCleanTextSegments(rootElement) {
    const segments = [];
    let currentSegmentText = "";
    
    function processNode(node) {
        const category = _getElementDisplayCategory(node);
        switch (category) {
            case 'text':
            case 'ruby_base_content': // Extract text from <rb>
                currentSegmentText += node.textContent || ""; 
                break;
            case 'inline':
            case 'ruby_container': // Process children of <ruby> and inline elements
                node.childNodes.forEach(processNode);
                break;
            case 'block':
                if (currentSegmentText.trim() !== "") segments.push(currentSegmentText.trim());
                currentSegmentText = "";
                node.childNodes.forEach(processNode);
                if (currentSegmentText.trim() !== "") segments.push(currentSegmentText.trim());
                currentSegmentText = "";
                break;
            case 'block_br':
                // Treat <br> as a segment separator if it produces meaningful separation
                if (currentSegmentText.trim() !== "") segments.push(currentSegmentText.trim());
                // else segments.push(""); // Optionally represent the break, but might lead to many empty segments
                currentSegmentText = "";
                break;
            case 'ruby_text_content': // Ignore <rt> for main text segments
            case 'ruby_punctuation':  // Ignore <rp>
            case 'ignore':
                break;
            default:
                console.warn("_extractCleanTextSegments: Unhandled category:", category, "for node:", node);
                node.childNodes.forEach(processNode); // Process children as a fallback
                break;
        }
    }

    if (rootElement && rootElement.childNodes) {
        rootElement.childNodes.forEach(processNode);
    }
    if (currentSegmentText.trim() !== "") segments.push(currentSegmentText.trim());
    return segments.filter(s => s !== ""); // Remove any fully empty strings
}

/**
 * Applies custom CSS to all hoverable word spans.
 * @param {string} cssString - The CSS string to apply.
 */
function applyCustomWordStyling(cssString) {
    let styleElement = document.getElementById('pr-custom-word-style');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'pr-custom-word-style';
        document.head.appendChild(styleElement);
    }
    // Prepend class selector to user styles for specificity, targeting only our spans
    // Example: if user writes ".known { color: blue; }", it becomes ".pr-hoverable-word.known { color: blue; }"
    // More robust parsing would be needed for complex selectors.
    const scopedCss = cssString.replace(/([.#\w][^{]*{)/g, `.${WORD_HOVER_CLASS}$1`);
    styleElement.textContent = scopedCss;
    // Alternative: Inject directly into shadow DOM of popup if styles are only for popup content
    // For word spans in main document, a global style tag is more straightforward.
}

// Export functions as an ES module
export { initWordHoverManager, activateHoverFeature, deactivateHoverFeature };

// Also provide a global reference for non-module scripts
window.wordHoverManager = { initWordHoverManager, activateHoverFeature, deactivateHoverFeature };

console.log("wordHoverManager.js loaded (ES module)"); 
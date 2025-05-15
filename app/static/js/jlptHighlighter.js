// jlptHighlighter.js
// This is now a thin wrapper around the TypeScript implementation

let jlptToggleCheckbox, contentAreaJlpt;
let trueOriginalServerContentForJlpt = "";
let originalPageContentForJlpt = ""; // The content *before* highlighting was applied

function _selectDOMElementsForJlpt() {
    jlptToggleCheckbox = document.getElementById('jlpt-highlighting');
    // contentAreaJlpt will be set during init
}

function getElementDisplayCategory(node) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
        if (node.nodeValue.trim() === "") return 'ignore'; 
        return 'text';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'MAP', 'AREA', 'HEAD', 'META', 'LINK'].includes(tagName)) {
            return 'ignore';
        }
        if (tagName === 'BR') return 'block_br';
        if (tagName === 'HR') return 'ignore'; // Typically visual, no text content for parsing

        if (tagName === 'RUBY') return 'ruby_container';
        if (tagName === 'RT') return 'ruby_text_content'; 
        if (tagName === 'RP') return 'ruby_punctuation';  
        if (tagName === 'RB') return 'ruby_base_content'; 

        const blockTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'FIELDSET', 'FORM', 'ADDRESS', 'FIGURE', 'FIGCAPTION'];
        if (blockTags.includes(tagName)) return 'block';

        const inlineTags = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'SUB', 'SUP', 'CODE', 'VAR', 'SAMP', 'KBD', 'Q', 'CITE', 'DFN', 'ABBR', 'TIME', 'MARK', 'SMALL', 'BIG']; // Removed IMG, INPUT etc.
        if (inlineTags.includes(tagName)) return 'inline';
        
        if (['IMG', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'LABEL'].includes(tagName)) return 'ignore';

        // Fallback based on computed style (use with caution, might not be available or accurate in all contexts)
        // try {
        //     const computedStyle = getComputedStyle(node);
        //     const display = computedStyle.display.toLowerCase();
        //     if (display.startsWith('block') || display === 'list-item') return 'block';
        //     if (display.startsWith('inline')) return 'inline';
        //     if (display === 'flex' || display === 'grid' || display.startsWith('table')) return 'block';
        //     if (display.startsWith('ruby')) return 'ruby_container';
        // } catch (e) { /* Ignore if getComputedStyle fails (e.g. detached node) */ }

        // If no specific category matches, and it's not explicitly ignored, process children (treat as inline-like container)
        console.warn(`getElementDisplayCategory: Unknown or unhandled tag ${tagName}. Treating as 'inline' for text extraction purposes.`);
        return 'inline'; 
    } else {
        return 'ignore';
    }
}

function extractCleanTextSegments(rootElement) {
    const segments = [];
    let currentText = "";
    function processNode(node) {
        const category = getElementDisplayCategory(node);
        switch (category) {
            case 'text':
            case 'ruby_base_content':
                currentText += node.textContent; 
                break;
            case 'inline':
            case 'ruby_container':
                node.childNodes.forEach(processNode);
                break;
            case 'block':
                if (currentText.trim() !== "") segments.push(currentText.trim());
                currentText = "";
                node.childNodes.forEach(processNode);
                if (currentText.trim() !== "") segments.push(currentText.trim());
                currentText = "";
                break;
            case 'block_br':
                if (currentText.trim() !== "") segments.push(currentText.trim());
                else segments.push(""); // Represent the break explicitly
                currentText = "";
                break;
            case 'ruby_text_content':
            case 'ruby_punctuation':
            case 'ignore':
                break;
            default:
                console.warn("extractCleanTextSegments encountered unhandled category:", category, "for node:", node);
                break;
        }
    }
    if (rootElement && rootElement.childNodes) {
        rootElement.childNodes.forEach(processNode);
    }
    if (currentText.trim() !== "") segments.push(currentText.trim());
    return segments.filter(s => s !== ""); // Remove empty strings unless they were intended by BR
}

function _attachJlptEventListeners() {
    if (jlptToggleCheckbox) {
        // The toggle event handler is now managed by the TypeScript library
        console.log("Using TypeScript implementation for JLPT highlighting");
    }
}

function initJlptHighlighter(config) {
    contentAreaJlpt = config.contentAreaElement; // Expect contentArea to be passed in
    trueOriginalServerContentForJlpt = config.trueOriginalServerContent;

    // Save original content for restoring later
    if (contentAreaJlpt) {
        contentAreaJlpt.setAttribute('data-original-content', contentAreaJlpt.innerHTML);
    }

    _selectDOMElementsForJlpt();
    
    if (!jlptToggleCheckbox) {
        console.warn("JLPT toggle checkbox not found, highlighter not fully initialized.");
    } else {
        // Initialize and wire up the TypeScript implementation
        if (window.jpHighlighter) {
            window.jpHighlighter.initialize(contentAreaJlpt).then(() => {
                window.jpHighlighter.wireUpToggle(contentAreaJlpt);
                
                if (jlptToggleCheckbox.checked) {
                    console.log("JLPT highlighting enabled on page load, applying highlights...");
                    if (contentAreaJlpt) {
                        window.jpHighlighter.highlightContent(contentAreaJlpt);
                    } else {
                        console.error("Cannot apply JLPT highlights on load: contentArea not ready.");
                    }
                }
            });
        } else {
            console.error("JP Highlighter module not loaded!");
            // Fallback to old implementation
            _attachJlptEventListeners();
            if (jlptToggleCheckbox.checked) {
                console.log("Using legacy JLPT highlighting (TypeScript module not loaded)");
                if (contentAreaJlpt) fetchAndApplyJlptHighlights();
                else console.error("Cannot apply JLPT highlights on load: contentArea not ready.");
            }
        }
    }
    console.log("JlptHighlighter initialized.");
}

// Legacy implementation kept for fallback
async function fetchAndApplyJlptHighlights() {
    if (!contentAreaJlpt) {
        console.error("JLPT Highlighter: Content area not set.");
        return;
    }
    
    const getCookieFunc = window.appUtils ? window.appUtils.getCookie : getCookie;
    const jpdbApiKey = getCookieFunc('jpdb_api_key')?.trim();
    
    // In demo mode, we don't need a real key as calls are mocked.
    if (!jpdbApiKey && !window.IS_DEMO_MODE) { 
        alert('JPDB API Key is not set. Please set it in settings.');
        if (jlptToggleCheckbox) jlptToggleCheckbox.checked = false;
        return;
    }

    originalPageContentForJlpt = contentAreaJlpt.innerHTML; // Store content before highlighting

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = originalPageContentForJlpt;
    const textSegments = extractCleanTextSegments(tempDiv);

    if (!textSegments || textSegments.length === 0) {
        console.log("No text segments to highlight.");
        return;
    }

    document.body.style.cursor = 'wait';
    try {
        const response = await fetch('/api/get_jpdb_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text_segments: textSegments, jpdb_api_key: jpdbApiKey })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `JPDB API Error: ${response.status}`);
        }
        const tokens = await response.json();
        if (tokens && tokens.error) throw new Error(tokens.error);
        if (!tokens || !Array.isArray(tokens)) throw new Error("Invalid token data.");

        applyJlptHighlightsToDOM(tokens);
    } catch (error) {
        console.error('Error fetching/applying JLPT highlights:', error);
        alert(`Could not apply JLPT highlights: ${error.message}`);
        contentAreaJlpt.innerHTML = originalPageContentForJlpt; // Revert on error
        if (jlptToggleCheckbox) {
            jlptToggleCheckbox.checked = false;
            fetch('/api/toggle_jlpt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
        }
    } finally {
        document.body.style.cursor = 'default';
    }
}

function applyJlptHighlightsToDOM(tokens) {
    if (!tokens || tokens.length === 0 || !contentAreaJlpt) return;
    tokens.sort((a, b) => a.start - b.start);
    let currentDocOffset = 0;
    let tokenIndex = 0;
    const treeWalker = document.createTreeWalker(contentAreaJlpt, NodeFilter.SHOW_TEXT, null, false);
    let textNode;
    const nodesToReplace = [];

    while (tokenIndex < tokens.length && (textNode = treeWalker.nextNode())) {
        const nodeText = textNode.nodeValue;
        const nodeLength = nodeText.length;
        const nodeEndOffset = currentDocOffset + nodeLength;
        while (tokenIndex < tokens.length && tokens[tokenIndex].end <= currentDocOffset) tokenIndex++;
        if (tokenIndex >= tokens.length) break;

        let currentToken = tokens[tokenIndex];
        let newChildrenForParent = [];
        let lastProcessedOffsetInNode = 0;

        while (tokenIndex < tokens.length && currentToken.start < nodeEndOffset) {
            currentToken = tokens[tokenIndex];
            if (currentToken.start >= nodeEndOffset) break;
            const tokenStartInNode = Math.max(0, currentToken.start - currentDocOffset);
            const tokenEndInNode = Math.min(nodeLength, currentToken.end - currentDocOffset);

            if (tokenStartInNode < tokenEndInNode) {
                if (tokenStartInNode > lastProcessedOffsetInNode) {
                    newChildrenForParent.push(document.createTextNode(nodeText.substring(lastProcessedOffsetInNode, tokenStartInNode)));
                }
                const span = document.createElement('span');
                span.className = 'jp-word';
                currentToken.state.forEach(s => span.classList.add(s));
                const wordText = nodeText.substring(tokenStartInNode, tokenEndInNode);
                span.appendChild(document.createTextNode(wordText));
                newChildrenForParent.push(span);
                lastProcessedOffsetInNode = tokenEndInNode;
                if (currentToken.end <= nodeEndOffset) tokenIndex++;
                else break;
            } else break;
        }
        if (lastProcessedOffsetInNode < nodeLength) {
            newChildrenForParent.push(document.createTextNode(nodeText.substring(lastProcessedOffsetInNode)));
        }
        if (newChildrenForParent.length > 0 && !(newChildrenForParent.length === 1 && newChildrenForParent[0].nodeType === Node.TEXT_NODE && newChildrenForParent[0].nodeValue === nodeText)) {
            nodesToReplace.push({original: textNode, replacements: newChildrenForParent});
        }
        currentDocOffset += nodeLength;
    }
    nodesToReplace.forEach(item => {
        const parent = item.original.parentNode;
        if (parent) {
            item.replacements.forEach(newNode => parent.insertBefore(newNode, item.original));
            parent.removeChild(item.original);
        }
    });
}

function removeJlptHighlights() {
    if (!contentAreaJlpt) return;
    // Restore to the content as it was *before* highlighting.
    // This might be the original server content, or a translation.
    contentAreaJlpt.innerHTML = originalPageContentForJlpt || trueOriginalServerContentForJlpt;
    console.log("JLPT highlights removed.");
    if (window.translationManager) window.translationManager.updateDisplayButtons();
}

window.jlptHighlighter = {
    initJlptHighlighter,
    fetchAndApplyJlptHighlights,
    removeJlptHighlights
}; 
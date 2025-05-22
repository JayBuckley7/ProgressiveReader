// --- Font Size Control Logic ---
const FONT_SIZE_KEY = 'readerUserFontSize'; // Renamed to avoid conflict if 'readerFontSize' was for something else
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 30;

let currentFontSize;
let contentAreaElement;
let currentFontSizeDisplayElement;

function applyFontSize(size) {
    if (contentAreaElement) {
        contentAreaElement.style.fontSize = size + 'px';
    }
    if (currentFontSizeDisplayElement) {
        currentFontSizeDisplayElement.textContent = size + 'px';
    }
}

function changeFontSize(delta) {
    let newSize = currentFontSize + delta;
    if (newSize < MIN_FONT_SIZE) newSize = MIN_FONT_SIZE;
    if (newSize > MAX_FONT_SIZE) newSize = MAX_FONT_SIZE;
    
    if (newSize !== currentFontSize) {
        currentFontSize = newSize;
        applyFontSize(currentFontSize);
        localStorage.setItem(FONT_SIZE_KEY, currentFontSize.toString());
    }
}

function initFontSizeManager() {
    const decreaseFontSizeBtn = document.getElementById('decrease-font-size');
    const increaseFontSizeBtn = document.getElementById('increase-font-size');
    currentFontSizeDisplayElement = document.getElementById('current-font-size');
    contentAreaElement = document.querySelector('.epub-content'); // Assuming this is where content lives

    if (!decreaseFontSizeBtn || !increaseFontSizeBtn || !currentFontSizeDisplayElement || !contentAreaElement) {
        console.warn("Font size control elements not found, skipping initialization.");
        return;
    }

    currentFontSize = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10) || DEFAULT_FONT_SIZE;
    if (isNaN(currentFontSize) || currentFontSize < MIN_FONT_SIZE || currentFontSize > MAX_FONT_SIZE) {
        currentFontSize = DEFAULT_FONT_SIZE;
    }

    applyFontSize(currentFontSize); 

    decreaseFontSizeBtn.addEventListener('click', () => changeFontSize(-1));
    increaseFontSizeBtn.addEventListener('click', () => changeFontSize(1));

//     console.log("FontSizeManager initialized.");
}

window.fontSizeManager = {
    initFontSizeManager,
    applyFontSize // Expose if needed externally, e.g., for initial load after settings
}; 
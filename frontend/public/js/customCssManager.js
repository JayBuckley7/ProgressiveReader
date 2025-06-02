// --- Custom CSS Application ---
function applyCustomWordCss() {
    const customCss = localStorage.getItem('customWordCSS');
    let styleElement = document.getElementById('custom-word-styles');
    
    if (!styleElement) { 
        console.warn("'custom-word-styles' element not found in HEAD. Creating it.");
        styleElement = document.createElement('style');
        styleElement.id = 'custom-word-styles';
        document.head.appendChild(styleElement);
    }

    if (customCss) {
        styleElement.textContent = customCss;
    } else {
        styleElement.textContent = ''; // Clear if no custom CSS
    }
}

function initCustomCssManager() {
    applyCustomWordCss(); // Apply on initial load
}

window.customCssManager = {
    applyCustomWordCss,
    initCustomCssManager
}; 
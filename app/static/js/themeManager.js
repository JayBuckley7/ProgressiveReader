function applyTheme(theme) {
    const htmlElement = document.documentElement;
    htmlElement.classList.remove('user-theme-light', 'user-theme-dark');
    if (theme === 'light') {
        htmlElement.classList.add('user-theme-light');
    } else if (theme === 'dark') {
        htmlElement.classList.add('user-theme-dark');
    }
    // If 'system', no class is added, CSS will rely on prefers-color-scheme
    console.log("Applied theme:", theme);
}

function initThemeManager() {
    const themeSelect = document.getElementById('theme-select');
    if (!themeSelect) {
        console.error("Theme select element not found.");
        return;
    }

    // Load initial theme from storage and apply
    const savedTheme = localStorage.getItem('userTheme') || 'system'; 
    themeSelect.value = savedTheme;
    applyTheme(savedTheme);

    // Listener for theme changes
    themeSelect.addEventListener('change', () => {
        const selectedTheme = themeSelect.value;
        // Use appUtils if available, otherwise assume global functions exist
        const setCookieFunc = window.appUtils ? window.appUtils.setCookie : setCookie;
        const applyCustomWordCssFunc = window.customCssManager ? window.customCssManager.applyCustomWordCss : applyCustomWordCss;

        setCookieFunc('userTheme', selectedTheme); // Save preference to cookie (redundant? Using localStorage mainly)
        localStorage.setItem('userTheme', selectedTheme); // Save preference to localStorage
        console.log('Theme saved:', selectedTheme);
        applyTheme(selectedTheme);
        
        // Re-apply custom CSS as theme change might affect it
        if (applyCustomWordCssFunc) {
            applyCustomWordCssFunc();
        } else {
            console.warn("applyCustomWordCss function not found when changing theme.");
        }
    });

    console.log("ThemeManager initialized.");
}

// Expose functions if needed by other modules, although init pattern is preferred
window.themeManager = {
    applyTheme,
    initThemeManager
}; 
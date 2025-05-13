function setCookie(name, value, days = 365) { 
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    // Ensure SameSite=Lax for modern browser compatibility
    const cookieString = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax"; // Store string
    document.cookie = cookieString; // Assign to document.cookie
    // console.log("Set cookie string:", cookieString); 
}

function getCookie(name) { 
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) {
            const value = c.substring(nameEQ.length, c.length);
            return value;
        }
    }
    return null;
}

// Make globally available if needed by multiple modules, or use ES modules later
window.appUtils = {
    setCookie,
    getCookie
};

console.log("utils.js loaded"); 
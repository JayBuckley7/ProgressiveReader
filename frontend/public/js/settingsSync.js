// settingsSync.js - synchronize user settings with the server
const COOKIE_KEYS = ['openai_api_key', 'jpdb_api_key', 'openai_model', 'target_language', 'cefr_index'];

function applySettings(settings) {
    if (!settings) return;
    const setCookieFunc = window.appUtils ? window.appUtils.setCookie : null;
    for (const [key, value] of Object.entries(settings)) {
        if (COOKIE_KEYS.includes(key)) {
            if (setCookieFunc) setCookieFunc(key, value);
        } else {
            try { localStorage.setItem(key, value); } catch (e) { console.warn('[settingsSync] failed to save', key); }
        }
    }
}

export async function init() {
    try {
        const resp = await fetch('/settings', { credentials: 'include' });
        if (resp.ok) {
            const data = await resp.json();
            applySettings(data);
        }
    } catch (err) {
        console.error('[settingsSync] init failed:', err);
    }
}

function gatherSettings() {
    const getCookieFunc = window.appUtils ? window.appUtils.getCookie : () => null;
    const all = {};
    COOKIE_KEYS.forEach(k => { const v = getCookieFunc(k); if (v !== null) all[k] = v; });
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) all[k] = localStorage.getItem(k);
    }
    return all;
}

export async function pushSettings() {
    try {
        await fetch('/settings', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gatherSettings())
        });
    } catch (err) {
        console.error('[settingsSync] push failed:', err);
    }
}

export default { init, pushSettings };

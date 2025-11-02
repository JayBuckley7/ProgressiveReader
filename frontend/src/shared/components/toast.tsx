import { jsxCreateElement } from '@shared/utils/jsx';

const toastContainer = document.createElement('div');
document.body.append(toastContainer);

// Check if Shadow DOM is supported and use it, otherwise use regular DOM
let shadowRoot: ShadowRoot | HTMLElement;
if (toastContainer.attachShadow) {
    shadowRoot = toastContainer.attachShadow({ mode: 'closed' });
} else {
    // Fallback: use the container itself if Shadow DOM not supported
    shadowRoot = toastContainer;
    console.warn('Shadow DOM not supported, using regular DOM for toasts');
}

// Add styles
const style = document.createElement('style');
if (shadowRoot === toastContainer) {
    // For regular DOM, use container-specific styles
    style.textContent = `
    .toast-container {
        position: fixed;
        top: 0.5em;
        right: 0.5em;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 0.5em;
    }

    .toast {
        background-color: #fff;
        border-radius: 4px;
        padding: 0.5em 1em;
        display: flex;
        flex-direction: row;
        gap: 0.5em;
        align-items: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .toast .buttons {
        margin-left: auto;
        display: flex;
        flex-direction: row;
        gap: 0.25em;
        align-items: center;
    }

    .toast button {
        padding: 0;
        margin: 0;
        width: 2.5em;
        height: 2.5em;
        line-height: 2.5em;
        text-align: center;
        background: none;
        border: none;
        cursor: pointer;
        border-radius: 50%;
    }

    .toast button:hover {
        background-color: rgba(0, 0, 0, 0.1);
    }

    @media (prefers-color-scheme: dark) {
        .toast {
            background-color: #333;
            color: #eee;
        }
        
        .toast button:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
    }
    `;
    document.head.append(style);
    toastContainer.className = 'toast-container';
} else {
    // For Shadow DOM, use :host styles
    style.textContent = `
    :host {
        all: initial;
        position: fixed;
        top: 0.5em;
        right: 0.5em;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 0.5em;
    }

    .toast {
        background-color: #fff;
        border-radius: 4px;
        padding: 0.5em 1em;
        display: flex;
        flex-direction: row;
        gap: 0.5em;
        align-items: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .toast .buttons {
        margin-left: auto;
        display: flex;
        flex-direction: row;
        gap: 0.25em;
        align-items: center;
    }

    .toast button {
        padding: 0;
        margin: 0;
        width: 2.5em;
        height: 2.5em;
        line-height: 2.5em;
        text-align: center;
        background: none;
        border: none;
        cursor: pointer;
        border-radius: 50%;
    }

    .toast button:hover {
        background-color: rgba(0, 0, 0, 0.1);
    }

    @media (prefers-color-scheme: dark) {
        .toast {
            background-color: #333;
            color: #eee;
        }
        
        .toast button:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
    }
    `;
    shadowRoot.append(style);
}

export function showToast(
    kind: string,
    message: string,
    options: { timeout?: number; actionIcon?: string; action?: () => void } = {},
) {
    const toast = document.createElement('div');
    toast.className = 'toast';

    const kindSpan = document.createElement('span');
    kindSpan.className = 'kind';
    kindSpan.textContent = `${kind}:`;
    toast.appendChild(kindSpan);

    const messageSpan = document.createElement('span');
    messageSpan.className = 'message';
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    const buttonsSpan = document.createElement('span');
    buttonsSpan.className = 'buttons';

    if (options.action) {
        const actionButton = document.createElement('button');
        actionButton.className = 'action';
        actionButton.textContent = options.actionIcon ?? 'o';
        actionButton.addEventListener('click', () => {
            try {
                options.action?.();
            } catch (error) {
                console.error('Toast action error:', error);
            }
        });
        buttonsSpan.appendChild(actionButton);
    }

    const closeButton = document.createElement('button');
    closeButton.className = 'close';
    closeButton.textContent = '✕';

    const removeToast = () => {
        if (shadowRoot.contains(toast)) {
            shadowRoot.removeChild(toast);
        }
    };

    closeButton.addEventListener('click', () => {
        removeToast();
        if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
        }
    });

    buttonsSpan.appendChild(closeButton);
    toast.appendChild(buttonsSpan);

    const timeoutHandle = options.timeout !== Infinity
        ? window.setTimeout(removeToast, options.timeout ?? 3000)
        : undefined;

    shadowRoot.appendChild(toast);
}

export function showError(error: Error | { message?: string; stack?: string | undefined } | string) {
    console.error(error);
    const message = typeof error === 'string'
        ? error
        : error?.message ?? JSON.stringify(error);
    const stack = typeof error === 'string'
        ? undefined
        : error?.stack;

    showToast('Error', message, {
        timeout: 5000,
        actionIcon: '⎘',
        action() {
            const text = `Error: ${message}${stack ? `\n${stack}` : ''}`;
            navigator.clipboard.writeText(text);
            showToast('Info', 'Error copied to clipboard!', { timeout: 1000 });
        },
    });
}

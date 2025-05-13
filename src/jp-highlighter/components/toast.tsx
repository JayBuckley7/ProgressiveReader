import { jsxCreateElement } from '../utils/jsx';

const toastContainer = <div></div>;
const shadow = toastContainer.attachShadow({ mode: 'closed' });

// Add styles directly in the shadow DOM
const style = document.createElement('style');
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

shadow.append(style);
document.body.append(toastContainer);

export function showToast(
    kind: string,
    message: string,
    options: { timeout?: number; actionIcon?: string; action?: () => void } = {},
) {
    const toast = (
        <div class='toast'>
            <span class='kind'>{kind}:</span>
            <span class='message'>{message}</span>
            <span class='buttons'>
                {options.action ? (
                    <button class='action' onclick={options.action}>
                        {options.actionIcon ?? 'o'}
                    </button>
                ) : (
                    ''
                )}
                <button
                    class='close'
                    onclick={() => {
                        shadow.removeChild(toast);
                        clearTimeout(timeout);
                    }}>
                    ✕
                </button>
            </span>
        </div>
    );

    const timeout =
        options.timeout != Infinity
            ? setTimeout(() => {
                  shadow.removeChild(toast);
              }, options.timeout ?? 3000)
            : undefined;

    shadow.append(toast);
}

export function showError(error: Error | { message: string; stack: string | undefined }) {
    console.error(error);
    showToast('Error', error.message, {
        timeout: 5000,
        actionIcon: '⎘',
        action() {
            navigator.clipboard.writeText(`Error: ${error.message}\n${error.stack}`);
            showToast('Info', 'Error copied to clipboard!', { timeout: 1000 });
        },
    });
} 
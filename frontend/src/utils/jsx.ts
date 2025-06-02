// Simplified JSX for creating DOM elements without React

type Props = Record<string, any>;

export function jsxCreateElement(tag: string | Function, props: Props | null, ...children: any[]): HTMLElement | DocumentFragment {
    if (typeof tag === 'function') {
        return tag({ ...props, children });
    }

    if (tag === '') {
        // Fragment
        const fragment = document.createDocumentFragment();
        children.flat().forEach(child => {
            if (child instanceof Node) {
                fragment.appendChild(child);
            } else if (child !== null && child !== undefined) {
                fragment.appendChild(document.createTextNode(String(child)));
            }
        });
        return fragment;
    }

    const element = document.createElement(tag);
    if (props) {
        for (const [key, value] of Object.entries(props)) {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key.startsWith('on') && typeof value === 'function') {
                const eventName = key.toLowerCase().substring(2);
                element.addEventListener(eventName, async (event) => {
                    try {
                        await value(event);
                    } catch (error) {
                        console.error('Event handler error:', error);
                    }
                });
            } else if (key !== 'children') {
                element.setAttribute(key, String(value));
            }
        }
    }

    children.flat().forEach(child => {
        if (child instanceof Node) {
            element.appendChild(child);
        } else if (child !== null && child !== undefined) {
            element.appendChild(document.createTextNode(String(child)));
        }
    });

    return element;
} 
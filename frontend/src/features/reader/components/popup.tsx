import { jsxCreateElement as createElement } from '@shared/utils/jsx';
import { nonNull } from '@shared/utils/util';
import { getCurrentConfig, mineWord, reviewCard, updateWordState, JpHighlighterConfig } from '@features/reader/content/api-adapter';
import { getSentences, JpdbWord, JpdbWordData } from '@features/reader/content/word';
import { getMeaning, getKunReading, getOnReading, getJlptLevel, getWordKanjiInfo } from '@shared/services/jlptService';

// Helper function to check if we should use local translation (no JPDB key available)
function shouldUseLocalTranslation(): boolean {
    const jpdbApiKey = document.cookie.match(/jpdbApiKey=([^;]+)/)?.[1] || "";
    return !jpdbApiKey;
}

function getClosestClientRect(elem: HTMLElement, x: number, y: number): DOMRect {
    const rects = elem.getClientRects();
    if (rects.length === 1) return rects[0];
    
    const { writingMode } = getComputedStyle(elem);
    const horizontal = writingMode.startsWith('horizontal');
    
    const mergedRects: DOMRect[] = [];
    for (const rect of rects) {
        if (mergedRects.length === 0) {
            mergedRects.push(rect);
            continue;
        }
        
        const prevRect = mergedRects[mergedRects.length - 1];
        
        if (horizontal) {
            if (rect.bottom === prevRect.bottom && rect.left === prevRect.right) {
                mergedRects[mergedRects.length - 1] = new DOMRect(
                    prevRect.x,
                    prevRect.y,
                    rect.right - prevRect.left,
                    prevRect.height,
                );
            } else {
                mergedRects.push(rect);
            }
        } else {
            if (rect.right === prevRect.right && rect.top === prevRect.bottom) {
                mergedRects[mergedRects.length - 1] = new DOMRect(
                    prevRect.x,
                    prevRect.y,
                    prevRect.width,
                    rect.bottom - prevRect.top,
                );
            } else {
                mergedRects.push(rect);
            }
        }
    }
    
    return mergedRects
        .map(rect => ({
            rect,
            distance: Math.max(rect.left - x, 0, x - rect.right) ** 2 + Math.max(rect.top - y, 0, y - rect.bottom) ** 2,
        }))
        .reduce((a, b) => (a.distance <= b.distance ? a : b)).rect;
}

export class Popup {
    #demoMode: boolean;
    #element: HTMLElement;
    #outerStyle: CSSStyleDeclaration;
    isVisible: boolean = false;

    static #popup: Popup;

    static get(): Popup {
        if (!this.#popup) {
            this.#popup = new this();
            document.body.append(this.#popup.#element);
        }
        return this.#popup;
    }

    static getDemoMode(parent: HTMLElement): Popup {
        const popup = new this(true);
        parent.append(popup.#element);
        return popup;
    }

    constructor(demoMode = false) {
        this.#demoMode = demoMode;
        this.#element = createElement('div', {
            id: 'jpdb-popup',
            onmousedown: (event: MouseEvent) => event.stopPropagation(),
            onclick: (event: MouseEvent) => event.stopPropagation(),
            onwheel: (event: WheelEvent) => event.stopPropagation(),
            style: `all:initial;z-index:2147483647;cursor:pointer;${
                demoMode ? '' : 'position:absolute;top:0;left:0;opacity:0;visibility:hidden;'
            };`
        }) as HTMLElement;
        
        this.#outerStyle = this.#element.style;
    }

    fadeIn() {
        this.#outerStyle.opacity = '1';
        this.#outerStyle.visibility = 'visible';
        this.isVisible = true;
    }

    fadeOut() {
        this.#outerStyle.opacity = '0';
        this.#outerStyle.visibility = 'hidden';
        this.isVisible = false;
    }

    containsMouse(event: MouseEvent): boolean {
        const targetElement = event.target as HTMLElement;
        if (targetElement) {
            return this.#element.contains(targetElement);
        }
        return false;
    }

    async showForWord(word: JpdbWord, mouseX = 0, mouseY = 0) {
        // Minimal implementation - full implementation should be restored from git
        this.fadeIn();
    }

    async setData(data: JpdbWordData) {
        // Minimal implementation - full implementation should be restored from git
    }

    async render() {
        // Minimal implementation - full implementation should be restored from git
    }
}

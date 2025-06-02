import { jsxCreateElement } from '../utils/jsx';
import { nonNull } from '../utils/util';
import { getCurrentConfig, mineWord, reviewCard, updateWordState, JpHighlighterConfig } from '../content/api-adapter';
import { getSentences, JpdbWord, JpdbWordData } from '../content/word';

// Parts of speech dictionary
const PARTS_OF_SPEECH: { [k: string]: string } = {
    n: 'Noun',
    pn: 'Pronoun',
    pref: 'Prefix',
    suf: 'Suffix',
    name: 'Name',
    'name-fem': 'Name (Feminine)',
    'name-male': 'Name (Masculine)',
    'name-surname': 'Surname',
    'name-person': 'Personal Name',
    'name-place': 'Place Name',
    'name-company': 'Company Name',
    'name-product': 'Product Name',
    'adj-i': 'Adjective',
    'adj-na': 'な-Adjective',
    'adj-no': 'の-Adjective',
    'adj-pn': 'Adjectival',
    'adj-nari': 'なり-Adjective (Archaic/Formal)',
    'adj-ku': 'く-Adjective (Archaic)',
    'adj-shiku': 'しく-Adjective (Archaic)',
    adv: 'Adverb',
    aux: 'Auxiliary',
    'aux-v': 'Auxiliary Verb',
    'aux-adj': 'Auxiliary Adjective',
    conj: 'Conjunction',
    cop: 'Copula',
    ctr: 'Counter',
    exp: 'Expression',
    int: 'Interjection',
    num: 'Numeric',
    prt: 'Particle',
    vt: 'Transitive Verb',
    vi: 'Intransitive Verb',
    v1: 'Ichidan Verb',
    'v1-s': 'Ichidan Verb (くれる Irregular)',
    v5: 'Godan Verb',
    v5u: 'う Godan Verb',
    'v5u-s': 'う Godan Verb (Irregular)',
    v5k: 'く Godan Verb',
    'v5k-s': 'く Godan Verb (いく/ゆく Irregular)',
    v5g: 'ぐ Godan Verb',
    v5s: 'す Godan Verb',
    v5t: 'つ Godan Verb',
    v5n: 'ぬ Godan Verb',
    v5b: 'ぶ Godan Verb',
    v5m: 'む Godan Verb',
    v5r: 'る Godan Verb',
    'v5r-i': 'る Godan Verb (Irregular)',
    v5aru: 'る Godan Verb (-ある Irregular)',
    vk: 'Irregular Verb (くる)',
    vs: 'する Verb',
    vz: 'ずる Verb',
    'vs-c': 'す Verb (Archaic)',
    v2: 'Nidan Verb (Archaic)',
    v4: 'Yodan Verb (Archaic)',
    v4k: '',
    v4g: '',
    v4s: '',
    v4t: '',
    v4h: '',
    v4b: '',
    v4m: '',
    v4r: '',
    va: 'Archaic',
};

function getClosestClientRect(elem: HTMLElement, x: number, y: number): DOMRect {
    const rects = elem.getClientRects();

    if (rects.length === 1) return rects[0];

    // Merge client rects that are adjacent
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

function renderPitch(reading: string, pitch: string) {
    if (reading.length != pitch.length - 1) {
        return <span>Error: invalid pitch</span>;
    }

    try {
        const parts: HTMLSpanElement[] = [];
        let lastBorder = 0;
        const borders = Array.from(pitch.matchAll(/L(?=H)|H(?=L)/g), x => nonNull(x.index) + 1);
        let low = pitch[0] === 'L';

        for (const border of borders) {
            parts.push(<span class={low ? 'low' : 'high'}>{reading.slice(lastBorder, border)}</span>);
            lastBorder = border;
            low = !low;
        }

        if (lastBorder != reading.length) {
            // No switch after last part
            parts.push(<span class={low ? 'low-final' : 'high-final'}>{reading.slice(lastBorder)}</span>);
        }

        return <span class='pitch'>{parts}</span>;
    } catch (error) {
        console.error(error);
        return <span>Error: invalid pitch</span>;
    }
}

export class Popup {
    #demoMode: boolean;
    #element: HTMLElement;
    #customStyle: HTMLElement;
    #outerStyle: CSSStyleDeclaration;
    #vocabSection: HTMLElement;
    #mineButtons: HTMLElement;
    #data!: JpdbWordData;
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

        this.#element = (
            <div
                id='jpdb-popup'
                onmousedown={(event: MouseEvent) => {
                    event.stopPropagation();
                }}
                onclick={(event: MouseEvent) => {
                    event.stopPropagation();
                }}
                onwheel={(event: WheelEvent) => {
                    event.stopPropagation();
                }}
                style={`all:initial;z-index:2147483647;${
                    demoMode ? '' : 'position:absolute;top:0;left:0;opacity:0;visibility:hidden;'
                };`}></div>
        );

        const shadow = this.#element.attachShadow({ mode: 'closed' });

        const popupStyles = document.createElement('style');
        popupStyles.textContent = `
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background-color: rgba(155, 155, 155, 0.5); border-radius: 4px; border: transparent; }
            
            article {
                display: flex;
                flex-direction: column;
                gap: 0.25em;
                margin: 0;
                padding: 1em;
                max-width: 24em;
                max-height: 40vh;
                overflow-y: auto;
                background-color: #fff;
                border-radius: 4px;
                color: #333;
                font-family: sans-serif;
                box-shadow: 5px 5px 15px 0px rgba(0, 0, 0, 0.5);
            }
            
            #mine-buttons, #review-buttons {
                display: flex;
                flex-direction: row;
                gap: 0.25em;
                font-size: 12px;
            }
            
            button {
                display: inline-block;
                padding: 0.25em 0.5em;
                margin: 0;
                border: none;
                font-size: 85%;
                border-radius: 4px;
                color: white;
                text-align: center;
                text-decoration: none;
                cursor: pointer;
                filter: saturate(50%);
            }
            
            button:hover { filter: brightness(120%); }
            button:active { filter: brightness(80%); }
            
            #header {
                display: flex;
                flex-direction: row;
                justify-content: left;
                align-items: center;
                gap: 0.5em;
                margin: 0;
                padding: 0;
                font-size: 150%;
                font-weight: bold;
            }
            
            #header a {
                color: #333;
                text-decoration: none;
            }
            
            #header a::after {
                content: ' 🔗';
                font-size: 50%;
                vertical-align: middle;
            }
            
            .state {
                display: flex;
                flex-direction: column;
                margin-left: auto;
                font-size: 50%;
                line-height: 100%;
            }
            
            .metainfo {
                display: flex;
                flex-direction: row;
                font-size: 12px;
                gap: 0.5em;
                white-space: nowrap;
                margin: 0.75em 0;
            }
            
            .pitch span {
                padding: 1px 1px 1px 2px;
                line-height: 1em;
                border-style: solid;
                border-image-slice: 2;
                border-image-source: linear-gradient(to bottom, rgba(232, 104, 123, 0.8), rgba(75, 141, 255, 0.8));
            }
            
            .pitch .low { border-width: 0 2px 2px 0; margin-right: -2px; }
            .pitch .high { border-width: 2px 2px 0 0; margin-right: -2px; }
            .pitch .low-final { border-width: 0 0 2px 0; }
            .pitch .high-final { border-width: 2px 0 0 0; }
            
            h2 {
                font-size: 0.75em;
                opacity: 0.7;
                margin-top: 1em;
                margin-bottom: 0.5em;
            }
            
            ol {
                margin: 0;
                padding: 0;
                padding-left: 2em;
            }
            
            button.add, button.edit-add-review { background-color: rgb(75, 141, 255); }
            button.forq { background-color: rgb(255, 69, 0); }
            button.blacklist { background-color: rgb(119, 119, 119); }
            button.never-forget { background-color: rgb(112, 192, 0); }
            button.nothing { background-color: rgb(255, 0, 0); }
            button.something { background-color: rgb(255, 0, 0); }
            button.hard { background-color: rgb(255, 69, 0); }
            button.good { background-color: rgb(112, 192, 0); }
            button.easy { background-color: rgb(75, 141, 255); }
            
            .state .locked { color: rgb(119, 119, 119); }
            .state .suspended { color: rgb(119, 119, 119); }
            .state .blacklisted { color: rgb(119, 119, 119); }
            .state .never-forget { color: rgb(112, 192, 0); }
            .state .not-in-deck { color: rgba(75, 141, 255); }
            .state .new { color: rgb(75, 141, 255); }
            .state .learning { color: rgb(94, 167, 128); }
            .state .known { color: rgb(112, 192, 0); }
            .state .due { color: rgb(255, 69, 0); }
            .state .failed { color: rgb(255, 0, 0); }
            
            @media (prefers-color-scheme: dark) {
                article {
                    background-color: #222;
                    color: #eee;
                }
                #header a { color: #eee; }
            }
        `;

        shadow.append(
            popupStyles,
            (this.#customStyle = <style></style>),
            <article lang='ja'>
                {(this.#mineButtons = <section id='mine-buttons'></section>)}
                <section id='review-buttons'>
                    <button
                        class='nothing'
                        onclick={
                            demoMode ? undefined : async () => await reviewCard(this.#data.token.card, 'nothing')
                        }>
                        Nothing
                    </button>
                    <button
                        class='something'
                        onclick={
                            demoMode ? undefined : async () => await reviewCard(this.#data.token.card, 'something')
                        }>
                        Something
                    </button>
                    <button
                        class='hard'
                        onclick={demoMode ? undefined : async () => await reviewCard(this.#data.token.card, 'hard')}>
                        Hard
                    </button>
                    <button
                        class='good'
                        onclick={demoMode ? undefined : async () => await reviewCard(this.#data.token.card, 'good')}>
                        Good
                    </button>
                    <button
                        class='easy'
                        onclick={demoMode ? undefined : async () => await reviewCard(this.#data.token.card, 'easy')}>
                        Easy
                    </button>
                </section>
                {(this.#vocabSection = <section id='vocab-content'></section>)}
            </article>,
        );

        this.#outerStyle = this.#element.style;
        this.updateStyle();
    }

    fadeIn() {
        const currentConfig = getCurrentConfig();
        const disableFade = currentConfig.customPopupCSS?.includes('disable-fade-animation') || currentConfig.disableFadeAnimation;
        if (!disableFade) {
            this.#outerStyle.transition = 'opacity 60ms ease-in, visibility 60ms';
        }
        this.#outerStyle.opacity = '1';
        this.#outerStyle.visibility = 'visible';
        this.isVisible = true;
    }

    fadeOut() {
        const currentConfig = getCurrentConfig();
        const disableFade = currentConfig.customPopupCSS?.includes('disable-fade-animation') || currentConfig.disableFadeAnimation;
        if (!disableFade) {
            this.#outerStyle.transition = 'opacity 200ms ease-in, visibility 200ms';
        }
        this.#outerStyle.opacity = '0';
        this.#outerStyle.visibility = 'hidden';
        this.isVisible = false;
    }

    disablePointer() {
        this.#outerStyle.pointerEvents = 'none';
        this.#outerStyle.userSelect = 'none';
    }

    enablePointer() {
        this.#outerStyle.pointerEvents = '';
        this.#outerStyle.userSelect = '';
    }

    render() {
        if (this.#data === undefined) return;

        if (!this.#data.token.card) {
            console.error('Card data is undefined');
            return;
        }

        const card = this.#data.token.card;

        const url = `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(
            card.reading,
        )}`;

        // Group meanings by part of speech
        const groupedMeanings: { partOfSpeech: string[]; glosses: string[][]; startIndex: number }[] = [];
        let lastPOS: string[] = [];
        for (const [index, meaning] of card.meanings.entries()) {
            if (
                // Same part of speech as previous meaning?
                meaning.partOfSpeech.length == lastPOS.length &&
                meaning.partOfSpeech.every((p, i) => p === lastPOS[i])
            ) {
                // Append to previous meaning group
                groupedMeanings[groupedMeanings.length - 1].glosses.push(meaning.glosses);
            } else {
                // Create a new meaning group
                groupedMeanings.push({
                    partOfSpeech: meaning.partOfSpeech,
                    glosses: [meaning.glosses],
                    startIndex: index,
                });
                lastPOS = meaning.partOfSpeech;
            }
        }

        this.#vocabSection.replaceChildren(
            <div id='header'>
                <a lang='ja' href={url} target='_blank'>
                    <span class='spelling'>{card.spelling}</span>
                    <span class='reading'>{card.spelling !== card.reading ? `(${card.reading})` : ''}</span>
                </a>
                <div class='state'>
                    {card.state.map(s => (
                        <span class={s}>{s}</span>
                    ))}
                </div>
            </div>,
            <div class='metainfo'>
                <span class='freq'>{card.frequencyRank ? `Top ${card.frequencyRank}` : ''}</span>
                {card.pitchAccent.map(pitch => renderPitch(card.reading, pitch))}
            </div>,
            ...groupedMeanings.flatMap(meanings => [
                <h2>
                    {meanings.partOfSpeech
                        .map(pos => PARTS_OF_SPEECH[pos] ?? `(Unknown part of speech #${pos}, please report)`)
                        .filter(x => x.length > 0)
                        .join(', ')}
                </h2>,
                <ol start={meanings.startIndex + 1}>
                    {meanings.glosses.map(glosses => (
                        <li>{glosses.join('; ')}</li>
                    ))}
                </ol>,
            ]),
        );

        const blacklisted = card.state.includes('blacklisted');
        const neverForget = card.state.includes('never-forget');

        this.#mineButtons.replaceChildren(
            <button
                class='add'
                onclick={
                    this.#demoMode
                        ? undefined
                        : () =>
                              mineWord(
                                  this.#data.token.card,
                                  getCurrentConfig().forqOnMine,
                                  getSentences(this.#data, getCurrentConfig().contextWidth).trim() || undefined,
                              )
                }>
                Add
            </button>,
            <button
                class='blacklist'
                onclick={
                    this.#demoMode
                        ? undefined
                        : async () => await updateWordState(this.#data.token.card, 'blacklist', !blacklisted)
                }>
                {!blacklisted ? 'Blacklist' : 'Remove from blacklist'}
            </button>,
            <button
                class='never-forget'
                onclick={
                    this.#demoMode
                        ? undefined
                        : async () => await updateWordState(this.#data.token.card, 'never-forget', !neverForget)
                }>
                {!neverForget ? 'Never forget' : 'Unmark as never forget'}
            </button>,
        );
    }

    setData(data: JpdbWordData) {
        this.#data = data;
        this.render();
    }

    containsMouse(event: MouseEvent): boolean {
        const targetElement = event.target as HTMLElement;

        if (targetElement) {
            return this.#element.contains(targetElement);
        }

        return false;
    }

    showForWord(word: JpdbWord, mouseX = 0, mouseY = 0) {
        const currentConfig = getCurrentConfig();
        console.log('Popup showForWord called:', word);
        console.log('Current popup config (showPopupOnHover from getCurrentConfig()):', currentConfig.showPopupOnHover);
        
        const data = word.jpdbData;
        
        if (!data || !data.token || !data.token.card) {
            console.error('Invalid word data or missing card data');
            return;
        }

        this.setData(data); // Because we need the dimensions of the popup with the new data

        const bbox = getClosestClientRect(word, mouseX, mouseY);

        const wordLeft = window.scrollX + bbox.left;
        const wordTop = window.scrollY + bbox.top;
        const wordRight = window.scrollX + bbox.right;
        const wordBottom = window.scrollY + bbox.bottom;

        // window.innerWidth/Height technically contains the scrollbar, so it's not 100% accurate
        // Good enough for this though
        const leftSpace = bbox.left;
        const topSpace = bbox.top;
        const rightSpace = window.innerWidth - bbox.right;
        const bottomSpace = window.innerHeight - bbox.bottom;

        const popupHeight = this.#element.offsetHeight;
        const popupWidth = this.#element.offsetWidth;

        const minLeft = window.scrollX;
        const maxLeft = window.scrollX + window.innerWidth - popupWidth;
        const minTop = window.scrollY;
        const maxTop = window.scrollY + window.innerHeight - popupHeight;

        let left = wordLeft;
        let top = wordBottom + 5;

        if (topSpace < popupHeight && bottomSpace < popupHeight) {
            // Not enough vertical space either way
            if (bottomSpace > topSpace) {
                // More space below than above
                top = wordBottom + 5;
            } else {
                // More space above than below
                top = wordTop - popupHeight - 5;
            }
        } else if (bottomSpace < popupHeight) {
            // Not enough space below the word
            top = wordTop - popupHeight - 5;
        }

        if (leftSpace < popupWidth / 2 && rightSpace < popupWidth / 2) {
            // Not enough horizontal space either way
            if (leftSpace > rightSpace) {
                // More space left than right
                left = wordRight - popupWidth;
            } else {
                // More space right than left
                left = wordLeft;
            }
        } else if (wordLeft + popupWidth > maxLeft) {
            // Popup would go offscreen to the right
            left = wordRight - popupWidth;
        }

        // Ensure the popup stays within the viewport
        left = Math.max(minLeft, Math.min(maxLeft, left));
        top = Math.max(minTop, Math.min(maxTop, top));

        this.#outerStyle.left = `${left}px`;
        this.#outerStyle.top = `${top}px`;

        this.fadeIn();
    }

    updateStyle(newCSS?: string) {
        const currentConfig = getCurrentConfig();
        const cssToApply = newCSS !== undefined ? newCSS : currentConfig.customPopupCSS;
        this.#customStyle.textContent = cssToApply || '';
    }
} 
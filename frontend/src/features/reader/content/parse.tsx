import { CardState, Token } from '~/types';
import { nonNull } from '@shared/utils/util';
import { jsxCreateElement as createElement } from '@shared/utils/jsx';
import { JpdbWord } from './word';
import { getCurrentConfig } from './api-adapter';
import { getJlptLevel, getWordKanjiInfo } from '@shared/services/jlptService';

// Global WeakMap for storing JPDB data when elements are not extensible
declare global {
    interface Window {
        jpdbDataMap?: WeakMap<HTMLElement, any>;
    }
}

export type Fragment = {
    start: number;
    end: number;
    length: number;
    node: Text;
    hasRuby: boolean;
};

/**
 * A Paragraph is a collection of fragments that are semantically connected.
 * Every sequence of inline elements not interrupted by a block element
 * in the source html corresponds to their own Paragraph.
 */
export type Paragraph = Fragment[];

export function displayCategory(node: Node): 'text' | 'ruby' | 'ruby-text' | 'inline' | 'block' | 'none' {
    if (node instanceof Text || node instanceof CDATASection) {
        return 'text';
    } else if (node instanceof Element) {
        // Translation overlays must be ignored by the tokenizer/fragments so JPDB offsets still map
        // to the original JP content.
        if (node.classList.contains('pr-translation') || node.hasAttribute('data-pr-translation')) {
            return 'none';
        }

        const display = getComputedStyle(node).display.split(/\s/g);
        if (display[0] === 'none') return 'none';

        // Workaround for Chrome not supporting multi-value display and display: ruby
        if (node.tagName === 'RUBY') return 'ruby';
        if (node.tagName === 'RP') return 'none';
        if (node.tagName === 'RT') return 'ruby-text';
        if (node.tagName === 'RB') return 'inline';

        // These are roughly ordered by the frequency we expect them to show up
        if (display.some(x => x.startsWith('block'))) return 'block';
        if (display.some(x => x.startsWith('inline'))) return 'inline';

        if (display[0] === 'flex') return 'block';
        if (display[0] === '-webkit-box') return 'block'; // Old name of flex? Still used on Google Search.
        if (display[0] === 'grid') return 'block';
        if (display[0].startsWith('table')) return 'block';
        if (display[0].startsWith('flow')) return 'block';
        if (display[0] === 'ruby') return 'ruby';
        if (display[0].startsWith('ruby-text')) return 'ruby-text';
        if (display[0].startsWith('ruby-base')) return 'inline';
        if (display[0].startsWith('math')) return 'inline';
        if (display.includes('list-item')) return 'block';

        // Questionable
        if (display[0] === 'contents') return 'inline';
        if (display[0] === 'run-in') return 'block';

        console.warn(`Unknown display value ${display.join(' ')}, please report this!`);
        return 'none';
    } else {
        return 'none';
    }
}

function splitFragment(fragments: Fragment[], fragmentIndex: number, splitOffset: number) {
    const oldFragment = fragments[fragmentIndex];

    const relativeOffset = splitOffset - oldFragment.start;
    const nodeLen = oldFragment.node.data.length;
    // Defensive: async highlight runs can become stale if the DOM changes mid-flight.
    // Avoid throwing on invalid split offsets (e.g. empty text nodes).
    if (relativeOffset <= 0 || relativeOffset >= nodeLen) {
        return;
    }

    const newNode = oldFragment.node.splitText(relativeOffset);

    // Insert new fragment
    const newFragment: Fragment = {
        start: splitOffset,
        end: oldFragment.end,
        length: oldFragment.end - splitOffset,
        node: newNode,
        hasRuby: oldFragment.hasRuby,
    };
    fragments.splice(fragmentIndex + 1, 0, newFragment);

    // Change endpoint of existing fragment accordingly
    oldFragment.end = splitOffset;
    oldFragment.length = splitOffset - oldFragment.start;
}

function insertBefore(newNode: Node, referenceNode: Node) {
    // Ensure newNode is actually a proper DOM Node
    if (!(newNode instanceof Node)) {
        console.error('insertBefore: newNode is not a proper DOM Node:', newNode);
        throw new TypeError('Failed to execute insertBefore: parameter 1 is not of type Node.');
    }
    nonNull(referenceNode.parentElement).insertBefore(newNode, referenceNode);
}

function insertAfter(newNode: Node, referenceNode: Node) {
    const parent = nonNull(referenceNode.parentElement);
    const sibling = referenceNode.nextSibling;
    if (sibling) {
        parent.insertBefore(newNode, sibling);
    } else {
        parent.appendChild(newNode);
    }
}

function wrap(node: Node, wrapper: HTMLElement) {
    insertBefore(wrapper, node);
    wrapper.append(node);
}

export const reverseIndex = new Map<string, { className: string; elements: JpdbWord[] }>();

// Function that will be hooked up to event handlers
let onWordHoverStart: (event: MouseEvent) => void = () => {};
let onWordHoverStop: (event?: MouseEvent) => void = () => {};

export function setWordHoverHandlers(
    startHandler: (e: MouseEvent) => void,
    stopHandler: () => void
) {
    onWordHoverStart = startHandler;
    onWordHoverStop = stopHandler;
}

// List of super common words that should not be colored (particles, basic grammar, etc.)
const COMMON_WORDS = new Set([
    // Basic particles
    'は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'より', 'へ',
    // Common conjunctions and grammar
    'です', 'である', 'だ', 'ます', 'ました', 'だった', 'でした',
    // Basic auxiliary words
    'て', 'た', 'で', 'だ', 'な', 'よ', 'ね', 'か', 'さ', 'ぞ', 'わ',
    // Common pronouns and basic words
    'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'ここ', 'そこ', 'あそこ',
    // Numbers and basic counters (super basic ones)
    '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    // Basic punctuation representations
    '、', '。', '！', '？', '（', '）', '「', '」'
]);

const SINGLE_PARTICLES = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'の', 'へ']);

// Helper function to get appropriate color class based on mode
function getColorClass(token: Token): string {
    const word = token.card.spelling;

    // Check if we should use local translation (no JPDB key OR offline)
    const config = getCurrentConfig();
    const shouldUseLocalTranslation = !config.apiKey || !navigator.onLine;

    if (shouldUseLocalTranslation) {
        // JLPT OFFLINE MODE: Use local JLPT database for coloring

        // Check if it's a super common word first
        if (COMMON_WORDS.has(word)) {
            return 'common-word';
        }

        // Check for single particles (common grammar elements)
        if (word.length === 1 && SINGLE_PARTICLES.has(word)) {
            return 'common-word';
        }

        // Look up word in JLPT database
        const jlptLevel = getJlptLevel(word);

        if (jlptLevel) {
            // Convert JLPT level to CSS class (e.g., "N5" -> "jlpt-n5")
            return `jlpt-${jlptLevel.toLowerCase()}`;
        }

        // Check if word has kanji that exist in database but no JLPT level
        const kanjiInfo = getWordKanjiInfo(word);
        if (kanjiInfo.length > 0) {
            // Word has kanji in database but no JLPT level - give it gray highlighting
            return 'jlpt-unknown';
        }

        // Word not found in JLPT database at all - don't highlight
        return 'common-word';
    } else {
        // ONLINE MODE: Use JPDB state-based coloring
        // Return empty string since state classes are already in baseClassName
        return '';
    }
}

export function applyTokens(fragments: Paragraph, tokens: Token[]) {
    fragments = fragments.filter(f => f.length > 0);
    let fragmentIndex = 0;
    let curOffset = 0;
    let fragment = fragments[fragmentIndex];
    const text = fragments.map(x => x.node.data.replace(/\u00A0/g, ' ')).join('');

    for (const token of tokens) {
        if (!fragment) {
            return;
        }

        // Wrap all unparsed fragments that appear before the token
        while (curOffset < token.start) {
            if (fragment.end > token.start) {
                // Only the beginning of the node is unparsed. Split it.
                splitFragment(fragments, fragmentIndex, token.start);
            }

            const unparsedWrapper = document.createElement('span');
            unparsedWrapper.className = 'jpdb-word unparsed';
            wrap(fragment.node, unparsedWrapper);

            curOffset += fragment.length;
            fragment = fragments[++fragmentIndex];
            if (!fragment) return;
        }

        // Accumulate fragments until we have enough to fit the current token
        while (curOffset < token.end) {
            if (fragment.end > token.end) {
                // Only the beginning of the node is part of the token. Split it.
                splitFragment(fragments, fragmentIndex, token.end);
            }

            // Create class name with appropriate coloring based on mode
            const cardState: CardState = Array.isArray(token.card?.state)
                ? token.card.state as CardState
                : ['not-in-deck'];

            if (!Array.isArray(token.card?.state)) {
                token.card = {
                    ...token.card,
                    state: cardState,
                } as typeof token.card;
            }

            const baseClassName = `jpdb-word ${cardState.join(' ')}`;
            const additionalColorClass = getColorClass(token);
            const className = additionalColorClass ? `${baseClassName} ${additionalColorClass}` : baseClassName;

            // Check if we're in a PDF text layer (invisible text)
            const isPdfTextLayer = fragment.node.parentElement?.closest('.textLayer') !== null;

            const wrapper = (
                token.rubies.length > 0 && !fragment.hasRuby ?
                    document.createElement('ruby') :
                    document.createElement('span')
            ) as JpdbWord;

            wrapper.className = className;

            // If PDF text layer, ensure text stays transparent even after highlighting
            if (isPdfTextLayer) {
                wrapper.style.color = 'transparent';
                wrapper.style.setProperty('color', 'transparent', 'important');
            }

            // Add event handlers
            wrapper.addEventListener('mouseenter', (event: Event) => {
                try {
                    onWordHoverStart(event as MouseEvent);
                } catch (error) {
                    console.error('Error in onWordHoverStart:', error);
                }
            });
            wrapper.addEventListener('mouseleave', (event: Event) => {
                onWordHoverStop(event as MouseEvent);
            });
            wrapper.addEventListener('click', (event: Event) => {
                // Allow links to function normally.
                if (wrapper.closest('a')) return;
                event.preventDefault();
                event.stopPropagation();
                try {
                    onWordHoverStart(event as MouseEvent);
                } catch (error) {
                    console.error('Error in onWordHoverStart:', error);
                }
            });

            const idx = reverseIndex.get(`${token.card.vid}/${token.card.sid}`);
            if (idx === undefined) {
                reverseIndex.set(`${token.card.vid}/${token.card.sid}`, { className, elements: [wrapper] });
            } else {
                idx.elements.push(wrapper);
            }

            wrapper.jpdbData = {
                token,
                context: text,
                contextOffset: token.start,
            };
            wrap(fragment.node, wrapper);

            if (!fragment.hasRuby) {
                for (const ruby of token.rubies) {
                    if (ruby.start >= fragment.start && ruby.end <= fragment.end) {
                        // Ruby is contained in fragment
                        if (ruby.start > fragment.start) {
                            splitFragment(fragments, fragmentIndex, ruby.start);
                            const emptyRt = document.createElement('rt');
                            insertAfter(emptyRt, fragment.node);
                            fragment = fragments[++fragmentIndex];
                        }

                        if (ruby.end < fragment.end) {
                            splitFragment(fragments, fragmentIndex, ruby.end);
                            const rubyTextRt = document.createElement('rt');
                            rubyTextRt.className = 'jpdb-furi';
                            rubyTextRt.textContent = ruby.text;
                            insertAfter(rubyTextRt, fragment.node);
                            fragment = fragments[++fragmentIndex];
                        } else {
                            const rubyTextRt = document.createElement('rt');
                            rubyTextRt.className = 'jpdb-furi';
                            rubyTextRt.textContent = ruby.text;
                            insertAfter(rubyTextRt, fragment.node);
                        }
                    }
                }
            }

            curOffset = fragment.end;

            fragment = fragments[++fragmentIndex];
            if (!fragment) break;
        }
    }

    // After a text, add any remaining unparsed fragments
    while (fragment) {
        const unparsedWrapper = document.createElement('span');
        unparsedWrapper.className = 'jpdb-word unparsed';
        wrap(fragment.node, unparsedWrapper);

        fragment = fragments[++fragmentIndex];
    }
}

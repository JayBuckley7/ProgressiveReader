import { Token } from '../types';
import { nonNull } from '../utils/util';
import { jsxCreateElement as createElement } from '../utils/jsx';
import { JpdbWord } from './word';
import { getCurrentConfig } from '../content/api-adapter';

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

    const newNode = oldFragment.node.splitText(splitOffset - oldFragment.start);

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
let onWordHoverStart: (event: MouseEvent) => void = () => {
    console.log('🔧 DEFAULT onWordHoverStart called - this should not happen!');
};
let onWordHoverStop: (event?: MouseEvent) => void = () => {
    console.log('🔧 DEFAULT onWordHoverStop called - this should not happen!');
};

export function setWordHoverHandlers(
    startHandler: (e: MouseEvent) => void,
    stopHandler: () => void
) {
    console.log('🔧 setWordHoverHandlers called with:', typeof startHandler, typeof stopHandler);
    console.log('🔧 startHandler function name:', startHandler.name);
    console.log('🔧 startHandler function toString:', startHandler.toString().substring(0, 200));
    onWordHoverStart = startHandler;
    onWordHoverStop = stopHandler;
    console.log('🔧 Handlers set, onWordHoverStart is now:', typeof onWordHoverStart);
    console.log('🔧 onWordHoverStart function name after assignment:', onWordHoverStart.name);
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

const SINGLE_PARTICLES = new Set(['は','が','を','に','で','と','の','へ']);

// Helper function to get appropriate color class based on mode
function getColorClass(token: Token): string {
    const word = token.card.spelling;
    
    // Check if we should use Google Translate (no JPDB key available)
    const jpdbApiKey = document.cookie.match(/jpdbApiKey=([^;]+)/)?.[1] || "";
    const shouldUseGoogleTranslate = !jpdbApiKey;
    
    if (shouldUseGoogleTranslate) {
        // OFFLINE MODE: Use JLPT-based coloring
        
        // Check if it's a super common word first
        if (COMMON_WORDS.has(word)) {
            return 'common-word';
        }
        
        // Check for JLPT level from the token data
        const jlptLevel = (token as any).jlpt;
        if (jlptLevel) {
            // Convert JLPT level to CSS class (e.g., "5" -> "jlpt-n5")
            return `jlpt-n${jlptLevel}`;
        }
        
        // Check word length for additional common word heuristics
        if (word.length === 1 && SINGLE_PARTICLES.has(word)) {
            return 'common-word';
        }
        
        // Unknown JLPT level
        return 'jlpt-unknown';
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
    const text = fragments.map(x => x.node.data.replace(/\u00A0/g,' ')).join('');

    for (const token of tokens) {
        if (!fragment) return;
        
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
            const baseClassName = `jpdb-word ${token.card.state.join(' ')}`;
            const additionalColorClass = getColorClass(token);
            const className = additionalColorClass ? `${baseClassName} ${additionalColorClass}` : baseClassName;
            
            const wrapper = (
                token.rubies.length > 0 && !fragment.hasRuby ? 
                    document.createElement('ruby') : 
                    document.createElement('span')
            ) as JpdbWord;
            
            wrapper.className = className;
            
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

            const idx = reverseIndex.get(`${token.card.vid}/${token.card.sid}`);
            if (idx === undefined) {
                reverseIndex.set(`${token.card.vid}/${token.card.sid}`, { className, elements: [wrapper] });
            } else {
                idx.elements.push(wrapper);
            }

            wrapper.jpdbData = {
                token,
                context: text,
                contextOffset: curOffset,
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
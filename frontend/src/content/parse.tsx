import { Token } from '../types';
import { nonNull } from '../utils/util';
import { jsxCreateElement } from '../utils/jsx';
import { JpdbWord } from './word';

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
let onWordHoverStart: (e: MouseEvent) => void = () => {};
let onWordHoverStop: () => void = () => {};

export function setWordHoverHandlers(
    startHandler: (e: MouseEvent) => void,
    stopHandler: () => void
) {
    console.log('🔧 setWordHoverHandlers called with:', typeof startHandler, typeof stopHandler);
    onWordHoverStart = startHandler;
    onWordHoverStop = stopHandler;
    console.log('🔧 Handlers set, onWordHoverStart is now:', typeof onWordHoverStart);
}

export function applyTokens(fragments: Paragraph, tokens: Token[]) {
    let fragmentIndex = 0;
    let curOffset = 0;
    let fragment = fragments[fragmentIndex];
    const text = fragments.map(x => x.node.data).join('');

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

            // Create class name exactly like the original implementation
            const className = `jpdb-word ${token.card.state.join(' ')}`;
            
            const wrapper = (
                token.rubies.length > 0 && !fragment.hasRuby ? 
                    document.createElement('ruby') : 
                    document.createElement('span')
            ) as JpdbWord;
            
            wrapper.className = className;
            
            // Add debugging and ensure we use current handlers
            wrapper.addEventListener('mouseenter', (e) => {
                console.log('🎯 mouseenter event fired on wrapper');
                console.log('🎯 onWordHoverStart function type:', typeof onWordHoverStart);
                if (typeof onWordHoverStart === 'function') {
                    onWordHoverStart(e);
                } else {
                    console.error('🎯 onWordHoverStart is not a function!', onWordHoverStart);
                }
            });
            wrapper.addEventListener('mouseleave', (e) => {
                console.log('🎯 mouseleave event fired on wrapper');
                console.log('🎯 onWordHoverStop function type:', typeof onWordHoverStop);
                if (typeof onWordHoverStop === 'function') {
                    onWordHoverStop();
                } else {
                    console.error('🎯 onWordHoverStop is not a function!', onWordHoverStop);
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

    // Wrap any left-over fragments in unparsed wrappers
    for (const fragment of fragments.slice(fragmentIndex)) {
        const unparsedWrapper = document.createElement('span');
        unparsedWrapper.className = 'jpdb-word unparsed';
        wrap(fragment.node, unparsedWrapper);
    }
} 
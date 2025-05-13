import { Token } from '../types';
import { nonNull } from '../utils/util';
import { jsxCreateElement } from '../utils/jsx';
import { JpdbWord } from './word';

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
    onWordHoverStart = startHandler;
    onWordHoverStop = stopHandler;
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

            wrap(fragment.node, <span class='jpdb-word unparsed'></span>);

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

            // Check if token.card and token.card.state exist before using join
            const stateClassNames = token.card && token.card.state ? token.card.state.join(' ') : 'unknown';
            const className = `jpdb-word ${stateClassNames}`;
            
            const wrapper = (
                token.rubies.length > 0 && !fragment.hasRuby ? (
                    <ruby class={className} onmouseenter={onWordHoverStart} onmouseleave={onWordHoverStop}></ruby>
                ) : (
                    <span class={className} onmouseenter={onWordHoverStart} onmouseleave={onWordHoverStop}></span>
                )
            ) as JpdbWord;

            const idx = reverseIndex.get(`${token.card?.vid || 0}/${token.card?.sid || 0}`);
            if (idx === undefined) {
                reverseIndex.set(`${token.card?.vid || 0}/${token.card?.sid || 0}`, { className, elements: [wrapper] });
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
                            insertAfter(<rt></rt>, fragment.node);
                            fragment = fragment = fragments[++fragmentIndex];
                        }

                        if (ruby.end < fragment.end) {
                            splitFragment(fragments, fragmentIndex, ruby.end);
                            insertAfter(<rt class='jpdb-furi'>{ruby.text}</rt>, fragment.node);
                            fragment = fragment = fragments[++fragmentIndex];
                        } else {
                            insertAfter(<rt class='jpdb-furi'>{ruby.text}</rt>, fragment.node);
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
        wrap(fragment.node, <span class='jpdb-word unparsed'></span>);
    }
} 
import type { Token } from '~/types';

/** A segmented character or synthetic local card is not a word definition. */
export function wholeWordDefinition(tokens: Token[], word: string): Token | undefined {
  return tokens.find(token => token.start === 0 && token.end === word.length && token.card.vid > 0 && token.card.meanings?.some(meaning => meaning.glosses?.length));
}

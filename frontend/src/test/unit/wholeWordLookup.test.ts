import { expect, it } from 'vitest';
import { wholeWordDefinition } from '@features/reader/utils/wholeWordLookup';
import type { Token } from '~/types';
const token = (start: number, end: number, vid: number, gloss: string) => ({ start, end, card: { vid, meanings: [{ glosses: [gloss] }] } } as Token);
it('uses the dictionary definition of 放課後 instead of its character meanings', () => {
  const word = token(0, 3, 123, 'after school');
  expect(wholeWordDefinition([token(0, 3, 0, '放: emit'), word], '放課後')).toBe(word);
});
it('does not present partial matches or local kanji cards as word meanings', () => {
  expect(wholeWordDefinition([token(0, 1, 10, 'emit'), token(1, 3, 20, 'lesson'), token(0, 3, 0, 'kanji meanings')], '放課後')).toBeUndefined();
});

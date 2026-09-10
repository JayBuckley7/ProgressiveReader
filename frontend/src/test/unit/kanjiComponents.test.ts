import { expect, it } from 'vitest';
import { getKanjiComponents } from '@features/reader/utils/kanjiComponents';
it('uses real component relationships for deeper digging', () => {
  expect(getKanjiComponents('放')).toEqual(['方', '攵']);
  expect(getKanjiComponents('課')).toEqual(['言', '果']);
  expect(getKanjiComponents('果')).toContain('木');
});
it('stops at unknown entries and prevents cycling to ancestors', () => {
  expect(getKanjiComponents('not a kanji')).toEqual([]);
  expect(getKanjiComponents('放', ['方'])).toEqual(['攵']);
});

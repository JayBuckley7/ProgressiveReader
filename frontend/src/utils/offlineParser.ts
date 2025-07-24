import TinySegmenter from 'tiny-segmenter';
import { Token, Card } from '../types';
import { lookup } from '../services/offlineDict';

const segmenter = new TinySegmenter();

export async function parseOffline(text: string): Promise<Token[]> {
  const words = segmenter.segment(text);
  const tokens: Token[] = [];
  let offset = 0;
  for (const w of words) {
    const entry = await lookup(w);
    const start = offset;
    const end = start + w.length;
    offset = end;
    const card: Card = {
      vid: entry?.vid ?? 0,
      sid: 0,
      rid: 0,
      state: ['not-in-deck'],
      spelling: w,
      reading: entry?.reading ?? w,
      frequencyRank: null,
      pitchAccent: [],
      meanings: entry ? [{ glosses: [], partOfSpeech: entry.pos }] : [],
    };
    const token: Token = {
      start,
      end,
      length: w.length,
      card,
      rubies: [],
    } as Token;
    if (entry?.jlpt) {
      // @ts-ignore - extra property for styling
      (token as any).jlpt = entry.jlpt;
    }
    tokens.push(token);
  }
  return tokens;
}

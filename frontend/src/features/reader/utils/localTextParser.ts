// Local Text Parser - combines TinySegmenter with local JLPT JSON lookup for offline parsing
// @ts-expect-error - tiny-segmenter doesn't have TypeScript definitions
import TinySegmenter from 'tiny-segmenter';
// @ts-expect-error - kuromoji doesn't have bundled TypeScript definitions
import kuromoji from 'kuromoji';
import { Token, Card } from '~/types';
import { appLog } from '@shared/appLog'
import { getJlptLevel, getWordKanjiInfo } from '@shared/services/jlptService';

const segmenter = new TinySegmenter();
const KUROMOJI_DICT_PATH = import.meta.env.MODE === 'test' || typeof window === 'undefined'
  ? 'node_modules/kuromoji/dict/'
  : '/node_modules/kuromoji/dict/';

type KuromojiToken = {
  surface_form: string;
  word_position?: number;
  reading?: string;
};

type KuromojiTokenizer = {
  tokenize: (text: string) => KuromojiToken[];
};

let kuromojiTokenizerPromise: Promise<KuromojiTokenizer | null> | null = null;

function getKuromojiTokenizer(): Promise<KuromojiTokenizer | null> {
  if (kuromojiTokenizerPromise) return kuromojiTokenizerPromise;

  kuromojiTokenizerPromise = new Promise((resolve) => {
    kuromoji.builder({ dicPath: KUROMOJI_DICT_PATH }).build((error: unknown, tokenizer: KuromojiTokenizer) => {
      if (error) {
        appLog.warn('[localTextParser] Kuromoji unavailable; falling back to TinySegmenter', error);
        resolve(null);
        return;
      }
      resolve(tokenizer);
    });
  });

  return kuromojiTokenizerPromise;
}

function katakanaToHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function isSkippableToken(value: string): boolean {
  return value.trim() === '' || /^[\s\u3000、。！？!?…・「」『』（）()[\]{}.,:;"'~-]+$/u.test(value);
}

//--------------------------------------------------------------------------
// splitByScript – guarantees each chunk is single‑script
//--------------------------------------------------------------------------
function splitByScript(token: string): string[] {
  const out: string[] = [];
  let buf = '', clsPrev = '';

  const cls = (c: string): string => {
    if (/[A-Za-z0-9''\-‑]/.test(c))       return 'latin';
    if (/[\u30A0-\u30FFー]/.test(c))       return 'kata';
    if (/[\u3040-\u309F]/.test(c))        return 'hira';
    if (/\s/.test(c))                     return 'space';
    return 'kanji';
  };

  for (const ch of token) {
    const c = cls(ch);
    if (c !== clsPrev && buf) { out.push(buf); buf = ''; }
    buf += ch; clsPrev = c;
  }
  if (buf) out.push(buf);
  return out;
}

//--------------------------------------------------------------------------
// improveSegmentation – async, dictionary‑aware, greedy merging
//--------------------------------------------------------------------------
async function improveSegmentation(raw: string[]): Promise<string[]> {
  // 0. explode mixed‑script tokens and strip nbsp / &nbsp;
  const segs: string[] = [];
  for (const t of raw) {
    if (!t) continue;
    const cleaned = t.replace(/\u00A0|&nbsp;/g, ' ');
    for (const piece of splitByScript(cleaned))
      segs.push(piece);
  }

  const out: string[] = [];
  let i = 0;

  const isAscii    = (s: string) => /^[A-Za-z0-9''\-‑]+$/.test(s);
  const isKatakana = (s: string) => /^[\u30A0-\u30FFー]+$/.test(s);
  const hit        = new Map<string, boolean>();
  const dictHit    = async (s: string) => {
    if (hit.has(s)) return hit.get(s)!;
    
    // Use heuristics instead of API calls for performance
    // This avoids spamming the backend with hundreds of API calls
    const isLikelyWord = s.length >= 2 && 
                        !/^[\s\u3000、。！？]+$/.test(s) && // not just punctuation/spaces
                        !/^[A-Za-z0-9]+$/.test(s);    // not just ASCII
    
    hit.set(s, isLikelyWord);
    return isLikelyWord;
  };

  while (i < segs.length) {
    const cur  = segs[i];
    const next = segs[i+1] ?? '';
    const nxt2 = segs[i+2] ?? '';

    // keep explicit spaces
    if (cur.trim() === '') { out.push(cur); i++; continue; }

    // 1. greedy ASCII merge
    if (isAscii(cur)) {
      let j=i, acc='';
      while (j<segs.length && isAscii(segs[j])) acc += segs[j++];
      out.push(acc); i=j; continue;
    }

    // 2. greedy Katakana merge
    if (isKatakana(cur)) {
      let j=i, acc='';
      while (j<segs.length && isKatakana(segs[j])) acc += segs[j++];
      out.push(acc); i=j; continue;
    }

    // 3. dictionary probe (tri‑ then bi‑gram)
    if (next && nxt2 &&
        !await dictHit(cur) && !await dictHit(next) && !await dictHit(nxt2) &&
        await dictHit(cur+next+nxt2)) {
      out.push(cur+next+nxt2); i+=3; continue;
    }
    if (next &&
        !await dictHit(cur) && !await dictHit(next) &&
        await dictHit(cur+next)) {
      out.push(cur+next); i+=2; continue;
    }

    // 4. original heuristics
    if (next && next.trim() !== '') {
      if (isVerbStem(cur) && ['て','た','で','だ'].includes(next)) {
        out.push(cur+next); i+=2; continue;
      }
      if (shouldMergeCompound(cur,next)) {
        out.push(cur+next); i+=2; continue;
      }
      if (cur.length>=2 && isParticleOrAuxiliary(next)) {
        out.push(cur+next); i+=2; continue;
      }
    }

    // 5. fallback
    out.push(cur); i++;
  }

  return out;
}

// Helper functions for segmentation logic
function isVerbStem(segment: string): boolean {
  if (segment.length < 1) return false;
  
  const commonVerbStems = [
    '持っ', '教え', '食べ', '行っ', '来', '見', '聞', '話', '働', '買っ', '売っ',
  ];
  
  return commonVerbStems.some(stem => segment === stem || segment.endsWith(stem));
}

function isParticleOrAuxiliary(segment: string): boolean {
  const particles = ['て', 'た', 'で', 'だ', 'な', 'よ', 'ね', 'か', 'さ', 'ぞ', 'わ', 'が', 'を', 'に', 'の', 'は', 'も', 'と'];
  const auxiliaries = ['ます', 'です', 'である', 'なる', 'いる', 'ある', 'する'];
  
  return (segment.length <= 2 && particles.includes(segment)) || auxiliaries.includes(segment);
}

function shouldMergeCompound(current: string, next: string): boolean {
  if (current.length === 0 || next.length === 0) return false;
  
  const commonPairs = [
    ['私', 'が'], ['私', 'は'], ['私', 'の'], ['私', 'を'], ['私', 'に'],
    ['最', 'も'], ['古', 'い'], ['友', '人'], ['誕', '生'], ['生', '日'],
    ['なん', 'て'], ['大丈', '夫'], ['天', '気'], ['映', '画'], ['音', '楽'],
  ];
  
  return commonPairs.some(([first, second]) => current === first && next === second);
}

function normalizeReading(reading: string): string {
  return reading
    .replace(/[.-].*$/u, '')
    .replace(/[()]/gu, '')
    .trim();
}

function buildBestEffortReading(word: string): string {
  const kanjiCount = Array.from(word).filter((char) => getWordKanjiInfo(char).length > 0).length;
  if (kanjiCount > 1) {
    return word;
  }

  const kanjiByChar = new Map(getWordKanjiInfo(word).map((entry) => [entry.kanji, entry]));
  let reading = '';
  let changed = false;

  for (const char of Array.from(word)) {
    const entry = kanjiByChar.get(char);
    if (!entry) {
      reading += char;
      continue;
    }

    const bestReading = entry.kun_readings[0] || entry.on_readings[0] || '';
    const normalized = normalizeReading(bestReading);
    if (normalized) {
      reading += normalized;
      changed = true;
    } else {
      reading += char;
    }
  }

  return changed ? reading : word;
}

function buildLocalCard(word: string, readingOverride?: string): Card {
  const kanjiInfo = getWordKanjiInfo(word);
  const level = getJlptLevel(word);
  const reading = readingOverride && readingOverride !== word ? readingOverride : buildBestEffortReading(word);
  const rankedKanji = kanjiInfo
    .map((entry) => entry.freq_mainichi_shinbun)
    .filter((rank): rank is number => typeof rank === 'number' && Number.isFinite(rank));

  return {
    vid: 0,
    sid: 0,
    rid: 0,
    state: ['not-in-deck'],
    spelling: word,
    reading,
    frequencyRank: rankedKanji.length > 0 ? Math.min(...rankedKanji) : null,
    pitchAccent: [],
    meanings: kanjiInfo.length > 0
      ? kanjiInfo.map((entry) => ({
          glosses: [
            `${entry.kanji}: ${entry.meanings.slice(0, 4).join(', ') || 'Definition not found'}`,
          ],
          partOfSpeech: [
            level ? `JLPT ${level}` : 'Local kanji',
            `${entry.stroke_count} strokes`,
          ],
        }))
      : [{
          glosses: ['Definition not found'],
          partOfSpeech: ['local lookup'],
        }],
  };
}

async function parseWithKuromoji(text: string): Promise<Token[] | null> {
  const tokenizer = await getKuromojiTokenizer();
  if (!tokenizer) return null;

  const kuromojiTokens = tokenizer.tokenize(text);
  const tokens: Token[] = [];
  let searchFrom = 0;

  for (const item of kuromojiTokens) {
    const word = item.surface_form;
    if (!word || isSkippableToken(word)) continue;

    const explicitStart = typeof item.word_position === 'number' ? item.word_position - 1 : -1;
    const foundStart = explicitStart >= searchFrom && text.slice(explicitStart, explicitStart + word.length) === word
      ? explicitStart
      : text.indexOf(word, searchFrom);
    if (foundStart < 0) continue;

    const start = foundStart;
    const end = start + word.length;
    searchFrom = end;

    const reading = item.reading ? katakanaToHiragana(item.reading) : undefined;
    tokens.push({
      start,
      end,
      length: word.length,
      card: buildLocalCard(word, reading),
      rubies: reading && reading !== word
        ? [{ text: reading, start: 0, end: word.length, length: word.length }]
        : [],
    });
  }

  return tokens;
}

export async function parseWithLocalLookup(text: string): Promise<Token[]> {
  appLog.debug('[localTextParser] Parsing text with local lookup');
  
  const startTime = performance.now();
  
  try {
    const kuromojiTokens = await parseWithKuromoji(text);
    if (kuromojiTokens) {
      appLog.debug(
        `[localTextParser] Tokens=${kuromojiTokens.length} (${(performance.now() - startTime).toFixed(1)}ms, kuromoji lookup)`
      );
      return kuromojiTokens;
    }

    // Initial segmentation with TinySegmenter
    const segmentationStart = performance.now();
    const rawSegments = segmenter.segment(text);
    appLog.debug(
      `[localTextParser] Raw segments=${rawSegments.length} (${(performance.now() - segmentationStart).toFixed(1)}ms)`
    );
    
    // Improve segmentation with post-processing
    const improveStart = performance.now();
    const improvedSegments = await improveSegmentation(rawSegments);
    appLog.debug(
      `[localTextParser] Improved segments=${improvedSegments.length} (${(performance.now() - improveStart).toFixed(1)}ms)`
    );
    
    // Generate tokens for local JLPT lookup (no external API calls)
    const tokens: Token[] = [];
    let offset = 0;
    
    // Process each segment and create tokens
    for (const word of improvedSegments) {
      if (word.length === 0) continue;
      
      const start = offset;
      const end = start + word.length;
      offset = end;
      
      const trimmedWord = word.trim();
      if (trimmedWord === '' || /^[\s\u3000、。！？．，]+$/.test(trimmedWord)) {
        // Skip pure punctuation/whitespace - don't create tokens for them
        continue;
      }
      
      const card = buildLocalCard(trimmedWord);
      
      const token: Token = {
        start,
        end,
        length: word.length,
        card,
        rubies: [],
      };
      
      tokens.push(token);
    }
    
    const totalTime = performance.now() - startTime;
    appLog.debug(
      `[localTextParser] Tokens=${tokens.length} (${totalTime.toFixed(1)}ms, local lookup)`
    );
    
    return tokens;
    
  } catch (error) {
    appLog.error('[parseWithLocalLookup] Error', error);
    
    // Basic fallback: split on whitespace and common punctuation
    const words = text.split(/[\s\u3000、。！？]+/).filter(w => w.length > 0);
    const tokens: Token[] = [];
    let offset = 0;
    
    for (const word of words) {
      const start = offset;
      const end = start + word.length;
      offset = end + 1;
      
      const card = buildLocalCard(word);
      
      const token: Token = {
        start,
        end,
        length: word.length,
        card,
        rubies: [],
      };
      
      tokens.push(token);
    }
    
    return tokens;
  }
}

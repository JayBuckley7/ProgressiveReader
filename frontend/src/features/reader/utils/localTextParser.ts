// Local Text Parser - combines TinySegmenter with local JLPT JSON lookup for offline parsing
// @ts-ignore - tiny-segmenter doesn't have TypeScript definitions
import TinySegmenter from 'tiny-segmenter';
import { Token, Card } from '~/types';
import { translationCache, checkCacheSize } from './translationCache';
import { appLog } from '@shared/appLog'

const segmenter = new TinySegmenter();

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
                        !/^[\s　、。！？]+$/.test(s) && // not just punctuation/spaces
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

export async function parseWithLocalLookup(text: string): Promise<Token[]> {
  appLog.debug('📝 Parsing text with TinySegmenter (local lookup mode)');
  
  const startTime = performance.now();
  
  try {
    // Initial segmentation with TinySegmenter
    const segmentationStart = performance.now();
    const rawSegments = segmenter.segment(text);
    appLog.debug(`📝 Raw segments: ${rawSegments.length} (${(performance.now() - segmentationStart).toFixed(1)}ms)`);
    
    // Improve segmentation with post-processing
    const improveStart = performance.now();
    const improvedSegments = await improveSegmentation(rawSegments);
    appLog.debug(`✨ Improved segments: ${improvedSegments.length} (${(performance.now() - improveStart).toFixed(1)}ms)`);
    
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
      if (trimmedWord === '' || /^[\s　、。！？．，]+$/.test(trimmedWord)) {
        // Skip pure punctuation/whitespace - don't create tokens for them
        continue;
      }
      
      // Create basic token - the real JLPT data lookup happens later in getColorClass()
      const card: Card = {
        vid: 0,
        sid: 0,
        rid: 0,
        state: ['not-in-deck'],
        spelling: trimmedWord,
        reading: trimmedWord,
        frequencyRank: null,
        pitchAccent: [],
        meanings: [{
          glosses: ['Local lookup pending'],
          partOfSpeech: ['unknown']
        }],
      };
      
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
    appLog.debug(`✅ Generated ${tokens.length} tokens in ${totalTime.toFixed(1)}ms (local lookup mode)`);
    
    return tokens;
    
  } catch (error) {
    console.error('❌ Error in parseWithLocalLookup:', error);
    
    // Basic fallback: split on whitespace and common punctuation
    const words = text.split(/[\s　、。！？]+/).filter(w => w.length > 0);
    const tokens: Token[] = [];
    let offset = 0;
    
    for (const word of words) {
      const start = offset;
      const end = start + word.length;
      offset = end + 1;
      
      const card: Card = {
        vid: 0,
        sid: 0,
        rid: 0,
        state: ['not-in-deck'],
        spelling: word,
        reading: word,
        frequencyRank: null,
        pitchAccent: [],
        meanings: [{
          glosses: ['Translation unavailable'],
          partOfSpeech: ['unknown']
        }],
      };
      
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


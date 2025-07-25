// @ts-ignore - tiny-segmenter doesn't have TypeScript definitions
import TinySegmenter from 'tiny-segmenter';
import { Token, Card } from '../types';
import { lookup } from '../services/offlineDict';

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
  const dictHit    = async (s: string) =>
    hit.has(s) ? hit.get(s)! : hit.set(s, !!(await lookup(s))).get(s)!;

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

    // 4. your original heuristics
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


// Check if text is a single digit (for number reconstruction)
function isDigit(text: string): boolean {
  return /^[0-9０-９一二三四五六七八九]$/.test(text);
}

// Check if text contains only English letters (for mixed content)
function isEnglishChar(text: string): boolean {
  return /^[A-Za-z]+$/.test(text);
}

// Check if word commonly stands alone (to avoid over-merging with お/ご)
function isCommonStandalone(word: string): boolean {
  const standalone = ['疲れ', '元気', '母', '父', '兄', '姉', '金', '水', '茶', '米', '酒'];
  return standalone.includes(word);
}

// Handle multi-segment patterns (3+ segments) - keeping old function for compatibility
function mergeMultiSegmentPatterns(segments: string[], startIndex: number): { word: string; length: number } {
  const current = segments[startIndex];
  const next = segments[startIndex + 1];
  const next2 = segments[startIndex + 2];
  const next3 = segments[startIndex + 3];
  const next4 = segments[startIndex + 4];
  
  if (!current) return { word: '', length: 0 };
  
  // 5-character patterns first
  if (current && next && next2 && next3 && next4) {
    // やっぱり pattern - any splitting variation
    if ((current === 'や' && next === 'っ' && next2 === 'ぱ' && next3 === 'り') ||
        (current === 'やっ' && next === 'ぱ' && next2 === 'り') ||
        (current === 'やっぱ' && next === 'り')) {
      return { word: 'やっぱり', length: getActualLength(['や', 'っ', 'ぱ', 'り'], segments, startIndex) };
    }
    
    // Numbers + 年経った pattern (30年経った)
    if (isNumber(current) && next === '年' && next2 === '経' && next3 === 'っ' && next4 === 'た') {
      return { word: current + next + next2 + next3 + next4, length: 5 };
    }
  }
  
  // 4-character patterns
  if (current && next && next2 && next3) {
    // もちろん pattern
    if ((current === 'も' && next === 'ち' && next2 === 'ろ' && next3 === 'ん') ||
        (current === 'もち' && next === 'ろ' && next2 === 'ん') ||
        (current === 'もちろ' && next === 'ん')) {
      return { word: 'もちろん', length: getActualLength(['も', 'ち', 'ろ', 'ん'], segments, startIndex) };
    }
    
    // ほんとう pattern  
    if ((current === 'ほ' && next === 'ん' && next2 === 'と' && next3 === 'う') ||
        (current === 'ほん' && next === 'と' && next2 === 'う') ||
        (current === 'ほんと' && next === 'う')) {
      return { word: 'ほんとう', length: getActualLength(['ほ', 'ん', 'と', 'う'], segments, startIndex) };
    }
    
    // Numbers + 年経っ pattern
    if (isNumber(current) && next === '年' && next2 === '経' && next3 === 'っ') {
      return { word: current + next + next2 + next3, length: 4 };
    }
  }
  
  // 3-character patterns
  if (current && next && next2) {
    // おそらく pattern - handle any splitting
    if ((current === 'お' && next === 'そ' && next2 === 'らく') ||
        (current === 'おそ' && next === 'ら' && next2 === 'く') ||
        (current === 'おそらく')) {
      return { word: 'おそらく', length: getActualLength(['お', 'そ', 'ら', 'く'], segments, startIndex) };
    }
    
    // きっと pattern
    if ((current === 'き' && next === 'っ' && next2 === 'と') ||
        (current === 'きっ' && next === 'と')) {
      return { word: 'きっと', length: getActualLength(['き', 'っ', 'と'], segments, startIndex) };
    }
    
    // たぶん pattern
    if ((current === 'た' && next === 'ぶ' && next2 === 'ん') ||
        (current === 'たぶ' && next === 'ん')) {
      return { word: 'たぶん', length: getActualLength(['た', 'ぶ', 'ん'], segments, startIndex) };
    }
    
    // やはり pattern
    if ((current === 'や' && next === 'は' && next2 === 'り') ||
        (current === 'やは' && next === 'り')) {
      return { word: 'やはり', length: getActualLength(['や', 'は', 'り'], segments, startIndex) };
    }
    
    // そして pattern
    if ((current === 'そ' && next === 'し' && next2 === 'て') ||
        (current === 'そし' && next === 'て')) {
      return { word: 'そして', length: getActualLength(['そ', 'し', 'て'], segments, startIndex) };
    }
    
    // Complex verb patterns like 信じられ
    if ((current === '信' && next === 'じ' && next2 === 'ら') ||
        (current === '信じ' && next === 'ら')) {
      return { word: '信じら', length: getActualLength(['信', 'じ', 'ら'], segments, startIndex) };
    }
  }
  
  return { word: '', length: 0 };
}

// Helper function to determine actual length needed based on how segments were split
function getActualLength(targetChars: string[], segments: string[], startIndex: number): number {
  let totalChars = targetChars.join('');
  let currentChars = '';
  let length = 0;
  
  for (let i = startIndex; i < segments.length && currentChars.length < totalChars.length; i++) {
    currentChars += segments[i];
    length++;
    if (currentChars === totalChars) {
      return length;
    }
  }
  
  return length;
}

// Check if text is katakana
function isKatakana(text: string): boolean {
  return /^[\u30A0-\u30FF]+$/.test(text);
}

// Check if text represents a number
function isNumber(text: string): boolean {
  return /^[0-9０-９一二三四五六七八九十百千万億]+$/.test(text);
}

// Check if text is a time or counter unit
function isTimeOrCounter(text: string): boolean {
  const timeCounters = ['年', '月', '日', '時', '分', '秒', '個', '本', '枚', '台', '人', '匹', '冊', '杯', '回'];
  return timeCounters.includes(text);
}

// Check if segments should merge as an adverb
function shouldMergeAsAdverb(current: string, next: string): boolean {
  const adverbPatterns = [
    // Common adverbs that get split
    ['お', 'そらく'], // おそらく
    ['たぶ', 'ん'], // たぶん
    ['きっ', 'と'], // きっと
    ['やっ', 'ぱり'], // やっぱり
    ['やは', 'り'], // やはり
    ['もち', 'ろん'], // もちろん
    ['ほん', 'とう'], // ほんとう
  ];
  
  return adverbPatterns.some(([first, second]) => current === first && next === second);
}

// Check if text is a verb inflection
function isVerbInflection(text: string): boolean {
  const inflections = [
    'て', 'た', 'で', 'だ', 'ます', 'ました', 'ない', 'なかっ', 'なく', 'ば', 'れば',
    'ください', 'ている', 'てい', 'った', 'んだ', 'のだ', 'よう', 'そう',
    'れる', 'られる', 'せる', 'させる', 'ながら', 'つつ', 'まで', 'から',
    'っている', 'ています', 'ていた', 'ていました', 'ていない', 'ていません'
  ];
  return inflections.includes(text) || 
         inflections.some(inf => text.includes(inf)) ||
         // Check for partial inflections that often get split
         text.endsWith('ている') || text.endsWith('ました') || text.endsWith('ません') ||
         text.endsWith('った') || text.endsWith('れる') || text.endsWith('られる');
}

// Check if a three-character combination is a common word
function isCommonThreeCharWord(word: string): boolean {
  const commonThreeChar = [
    'おそらく', 'きっと', 'やっぱり', 'やはり', 'もちろん', 'ほんとう', 'たぶん',
    '友達', '先生', '学生', '会社', '電話', '写真', '映画', '音楽', '料理',
    '誕生日', 'プレゼント', 'コンピューター'
  ];
  return commonThreeChar.includes(word);
}

// Check if a segment is likely a verb stem that should be merged with following particles
function isVerbStem(segment: string): boolean {
  if (segment.length < 1) return false;
  
  // Based on real TinySegmenter results, focus on specific verb stems that actually get split
  const commonVerbStems = [
    '持っ', // 持って from "持っている"
    '教え', // 教えて
    '食べ', // 食べて
    '行っ', // 行って
    '来', // 来て
    '見', // 見て
    '聞', // 聞いて
    '話', // 話して
    '働', // 働いて
    '買っ', // 買って
    '売っ', // 売って
  ];
  
  return commonVerbStems.some(stem => segment === stem || segment.endsWith(stem));
}

// Check if a segment is a particle or auxiliary that should merge with the previous word
function isParticleOrAuxiliary(segment: string): boolean {
  const particles = ['て', 'た', 'で', 'だ', 'な', 'よ', 'ね', 'か', 'さ', 'ぞ', 'わ', 'が', 'を', 'に', 'の', 'は', 'も', 'と'];
  const auxiliaries = ['ます', 'です', 'である', 'なる', 'いる', 'ある', 'する'];
  
  return (segment.length <= 2 && particles.includes(segment)) || auxiliaries.includes(segment);
}

// Check if two segments should be merged as a compound
function shouldMergeCompound(current: string, next: string): boolean {
  // Don't merge if either is too short (except for specific patterns)
  if (current.length === 0 || next.length === 0) return false;
  
  // Common compound patterns
  const compoundPatterns = [
    // Common word parts that get split
    () => isCommonWordPart(current, next),
    
    // Numbers + counters
    () => isNumber(current) && isCounter(next),
    
    // Adjective + noun compounds that TinySegmenter splits incorrectly
    () => current.length >= 2 && next.length >= 2 && isAdjectiveStem(current) && isNoun(next),
    
    // Common endings that should stay with the main word
    () => current.length >= 2 && isCommonEnding(next),
    
    // Question words and expressions
    () => isQuestionPattern(current, next),
  ];
  
  return compoundPatterns.some(pattern => pattern());
}

function isCommonWordPart(current: string, next: string): boolean {
  const commonPairs = [
    // Common words that get split
    ['私', 'が'], ['私', 'は'], ['私', 'の'], ['私', 'を'], ['私', 'に'],  // 私が、私は、etc.
    ['最', 'も'], // 最も
    ['古', 'い'], // 古い
    ['友', '人'], // 友人
    ['誕', '生'], ['生', '日'], // 誕生、生日 (part of 誕生日)
    ['ミル', 'ク'], ['ジャ', 'グ'], // ミルク、ジャグ
    ['なん', 'て'], // なんて
    ['信じ', 'ら'], ['られ', 'ま'], ['ます', 'か'], // 信じられますか parts
    ['感謝', 'し'], ['し', 'て'], ['してい', 'る'], // 感謝している parts
    ['持っ', 'て'], ['てい', 'る'], // 持っている parts
    ['経っ', 'た'], ['った', 'なんて'], // 経ったなんて parts
    ['大丈', '夫'], // 大丈夫
    ['天', '気'], ['映', '画'], ['音', '楽'], // 天気、映画、音楽
    ['先', '生'], ['学', '生'], ['会', '社'], // 先生、学生、会社
    ['家', '族'], ['母', 'さん'], ['父', 'さん'], // 家族、お母さん、お父さん
    // Question patterns
    ['何', '時'], ['どこ', 'で'], ['いくら', 'で'], ['いつ', 'で'],
    // Verb patterns  
    ['教え', 'て'], ['食べ', 'て'], ['行き', 'ます'], ['来', 'ます'],
    ['見', 'て'], ['聞', 'いて'], ['話', 'して'], ['働', 'いて'],
    // Complex patterns from user's text
    ['多く', 'の'], ['古い', '友'], ['友人', '。'], ['そして', '、'],
  ];
  
  return commonPairs.some(([first, second]) => current === first && next === second);
}

function isCounter(segment: string): boolean {
  const counters = ['個', '本', '枚', '台', '人', '匹', '冊', '杯', '回', '年', '月', '日', '時', '分', '秒'];
  return counters.includes(segment);
}

function isCommonEnding(segment: string): boolean {
  const endings = ['てい', 'ている', 'ました', 'ません', 'でし', 'っている', 'なかっ'];
  return endings.includes(segment);
}

function isQuestionPattern(current: string, next: string): boolean {
  // Common question endings
  return (current === 'なん' && next === 'て') || 
         (current === 'です' && next === 'か') ||
         (current === 'ます' && next === 'か') ||
         (current === 'だ' && next === 'か') ||
         (current === 'である' && next === 'か') ||
         // Question words
         (current === '何' && (next === '時' || next === 'で' || next === 'を')) ||
         (current === 'どこ' && (next === 'で' || next === 'に' || next === 'の')) ||
         (current === 'いくら' && (next === 'で' || next === 'の')) ||
         (current === 'いつ' && (next === 'で' || next === 'に')) ||
         // Complex question patterns
         (current === '信じら' && next === 'れ') ||
         (current === '信じられ' && next === 'ま') ||
         (current === 'られま' && next === 'す') ||
         (current === 'らま' && next === 'すか');
}

function isAdjectiveStem(segment: string): boolean {
  // Check for common adjective patterns
  const adjectives = ['古', '新し', '大き', '小さ', '高', '安', '美し', '難し', '易し'];
  return segment.endsWith('い') || segment.endsWith('な') || adjectives.some(adj => segment.includes(adj));
}

function isNoun(segment: string): boolean {
  // Basic heuristic - most single character segments that aren't particles are likely nouns
  // This is a simplification and could be improved
  return segment.length >= 1 && !isParticleOrAuxiliary(segment);
}

export async function parseOffline(text: string): Promise<Token[]> {
  // Debug logging removed for cleaner console output
  
  try {
    // Initial segmentation with TinySegmenter
    const rawSegments = segmenter.segment(text);
    // TinySegmenter debug logging removed
    
    // Improve segmentation with post-processing
    const improvedSegments = await improveSegmentation(rawSegments);
    // Improved segments debug logging removed
    
    // DEBUG: Show word-to-segment mapping
    debugWordSegmentMapping(text, improvedSegments);
    
    // Generate tokens
    const tokens: Token[] = [];
    let offset = 0;
    
    for (const word of improvedSegments) {
      if (word.length === 0) continue;
      
      const entry = await lookup(word);
      const start = offset;
      const end = start + word.length;
      offset = end;
      
      const card: Card = {
        vid: entry?.vid ?? 0,
        sid: 0,
        rid: 0,
        state: ['not-in-deck'],
        spelling: word,
        reading: entry?.reading ?? word,
        frequencyRank: null,
        pitchAccent: [],
        meanings: entry?.meanings?.map(meaning => ({
          glosses: meaning.glosses,
          partOfSpeech: meaning.partOfSpeech ?? entry?.pos ?? ['unknown']
        })) ?? [{ 
          glosses: ['No definition available'], 
          partOfSpeech: entry?.pos ?? ['unknown'] 
        }],
      };
      
      const token: Token = {
        start,
        end,
        length: word.length,
        card,
        rubies: [],
      } as Token;
      
      if (entry?.jlpt) {
        // @ts-ignore - extra property for styling
        (token as any).jlpt = entry.jlpt;
      }
      
      tokens.push(token);
    }
    
    // Token count debug logging removed
    return tokens;
    
  } catch (error) {
    console.error('❌ Error in parseOffline:', error);
    
    // Basic fallback: split on whitespace and common punctuation
    const words = text.split(/[\s　、。！？]+/).filter(w => w.length > 0);
    const tokens: Token[] = [];
    let offset = 0;
    
    for (const word of words) {
      const entry = await lookup(word);
      const start = offset;
      const end = start + word.length;
      offset = end;
      
      const card: Card = {
        vid: entry?.vid ?? 0,
        sid: 0,
        rid: 0,
        state: ['not-in-deck'],
        spelling: word,
        reading: entry?.reading ?? word,
        frequencyRank: null,
        pitchAccent: [],
        meanings: entry?.meanings?.map(meaning => ({
          glosses: meaning.glosses,
          partOfSpeech: meaning.partOfSpeech ?? entry?.pos ?? ['unknown']
        })) ?? [{ 
          glosses: ['No definition available'], 
          partOfSpeech: entry?.pos ?? ['unknown'] 
        }],
      };
      
      const token: Token = {
        start,
        end,
        length: word.length,
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
}

/**
 * Debug function to show how individual characters map to segments
 * This helps visualize the segmentation before adding overlays
 */
function debugWordSegmentMapping(originalText: string, segments: string[]): void {
  // Word-to-segment mapping debug section removed for cleaner console output
  
  // Create a mapping of character positions to segment info
  const charToSegmentMap: Array<{
    char: string;
    segmentIndex: number;
    segmentText: string;
    positionInSegment: number;
  }> = [];
  
  let textOffset = 0;
  
  // Build the mapping
  segments.forEach((segment, segmentIndex) => {
    for (let i = 0; i < segment.length; i++) {
      const char = segment[i];
      const globalPosition = textOffset + i;
      
      if (globalPosition < originalText.length) {
        charToSegmentMap.push({
          char: char,
          segmentIndex: segmentIndex,
          segmentText: segment,
          positionInSegment: i
        });
      }
    }
    textOffset += segment.length;
  });
  
  // Display the mapping
  // Original text debug logging removed
  
  charToSegmentMap.forEach((mapping, charIndex) => {
    const isFirstCharOfSegment = mapping.positionInSegment === 0;
    const segmentMarker = isFirstCharOfSegment ? `[S${mapping.segmentIndex}]` : '     ';
    
    // Character debug logging removed
  });
  
  // Segment summary debug logging removed
  segments.forEach((segment, index) => {
    const charCount = segment.length;
    const segmentType = getSegmentType(segment);
    // Individual segment debug logging removed
  });
  
  console.log('=' .repeat(50));
  console.log('');
}

/**
 * Helper function to classify segment types for debugging
 */
function getSegmentType(segment: string): string {
  if (!segment || segment.trim() === '') return 'whitespace';
  if (/^[A-Za-z0-9''\-‑]+$/.test(segment)) return 'latin';
  if (/^[\u30A0-\u30FFー]+$/.test(segment)) return 'katakana';
  if (/^[\u3040-\u309F]+$/.test(segment)) return 'hiragana';
  if (/^[\u4e00-\u9faf]+$/.test(segment)) return 'kanji';
  if (/^[０-９0-9]+$/.test(segment)) return 'number';
  if (/^[、。！？．，；：]+$/.test(segment)) return 'punctuation';
  return 'mixed';
}

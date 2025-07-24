import TinySegmenter from 'tiny-segmenter';
import { Token, Card } from '../types';
import { lookup } from '../services/offlineDict';

const segmenter = new TinySegmenter();

// Improved segmentation with post-processing to merge appropriate segments
function improveSegmentation(segments: string[]): string[] {
  const improved: string[] = [];
  let i = 0;
  
  while (i < segments.length) {
    const current = segments[i];
    const next = segments[i + 1];
    
    // Skip empty or whitespace-only segments
    if (!current || current.trim() === '') {
      if (current) improved.push(current); // Preserve spaces
      i++;
      continue;
    }
    
    // Merge patterns for better Japanese word boundaries
    let shouldMerge = false;
    
    if (next && next.trim() !== '') {
      // Pattern 1: Verb stem + te form (教え + て = 教えて)
      if (isVerbStem(current) && (next === 'て' || next === 'た' || next === 'で' || next === 'だ')) {
        improved.push(current + next);
        i += 2;
        continue;
      }
      
      // Pattern 2: Common compound patterns
      if (shouldMergeCompound(current, next)) {
        improved.push(current + next);
        i += 2;
        continue;
      }
      
      // Pattern 3: Single character particles that should stay with previous word
      if (current.length >= 2 && isParticleOrAuxiliary(next)) {
        improved.push(current + next);
        i += 2;
        continue;
      }
    }
    
    improved.push(current);
    i++;
  }
  
  return improved;
}

// Check if a segment is likely a verb stem that should be merged with following particles
function isVerbStem(segment: string): boolean {
  if (segment.length < 2) return false;
  
  // Common verb stem endings that often get followed by て, た, etc.
  const verbStemPatterns = [
    'え', // ichidan verbs (教え, 食べ, etc.)
    'き', // godan k-verbs
    'ち', // godan t-verbs
    'し', // godan s-verbs
    'み', // godan m-verbs
    'び', // godan b-verbs
    'り', // godan r-verbs
    'ぎ', // godan g-verbs
  ];
  
  const lastChar = segment.charAt(segment.length - 1);
  return verbStemPatterns.includes(lastChar);
}

// Check if a segment is a particle or auxiliary that should merge with the previous word
function isParticleOrAuxiliary(segment: string): boolean {
  const particles = ['て', 'た', 'で', 'だ', 'な', 'よ', 'ね', 'か', 'さ', 'ぞ', 'わ'];
  return segment.length === 1 && particles.includes(segment);
}

// Check if two segments should be merged as a compound
function shouldMergeCompound(current: string, next: string): boolean {
  // Don't merge if either is too short (except for specific particles)
  if (current.length < 2 && next.length < 2) return false;
  
  // Common compound patterns
  const compoundPatterns = [
    // Honorific + word
    () => current === 'お' && next.length >= 2,
    () => current === 'ご' && next.length >= 2,
    
    // Numbers + counters
    () => /[一二三四五六七八九十百千万億\d]/.test(current) && isCounter(next),
    
    // Adjective + noun compounds that TinySegmenter splits incorrectly
    () => current.length >= 2 && next.length >= 2 && isAdjectiveStem(current) && isNoun(next),
  ];
  
  return compoundPatterns.some(pattern => pattern());
}

function isCounter(segment: string): boolean {
  const counters = ['個', '本', '枚', '台', '人', '匹', '冊', '杯', '回', '年', '月', '日', '時', '分', '秒'];
  return counters.includes(segment);
}

function isAdjectiveStem(segment: string): boolean {
  // Very basic check - this could be improved with a dictionary
  return segment.endsWith('い') || segment.endsWith('な');
}

function isNoun(segment: string): boolean {
  // Basic heuristic - most single character segments that aren't particles are likely nouns
  // This is a simplification and could be improved
  return segment.length >= 1 && !isParticleOrAuxiliary(segment);
}

export async function parseOffline(text: string): Promise<Token[]> {
  console.log('🔍 parseOffline received text:', JSON.stringify(text));
  console.log('🔍 text length:', text.length);
  
  try {
    // Initial segmentation with TinySegmenter
    const rawSegments = segmenter.segment(text);
    console.log('🔍 TinySegmenter raw segments:', rawSegments.length, rawSegments);
    
    // Improve segmentation with post-processing
    const improvedSegments = improveSegmentation(rawSegments);
    console.log('🔍 Improved segments:', improvedSegments.length, improvedSegments);
    
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
        meanings: entry ? [{ glosses: [], partOfSpeech: entry.pos }] : [],
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
    
    console.log('🔍 Generated tokens:', tokens.length);
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
        meanings: entry ? [{ glosses: [], partOfSpeech: entry.pos }] : [],
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

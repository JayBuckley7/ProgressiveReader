// Google Translate Parser - combines TinySegmenter with Google Translate for definitions
// @ts-ignore - tiny-segmenter doesn't have TypeScript definitions
import TinySegmenter from 'tiny-segmenter';
import { Token, Card } from '../types';
import { translationCache, checkCacheSize } from './translationCache';

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

export async function parseWithGoogleTranslate(text: string): Promise<Token[]> {
  console.log('🌐 Parsing text with TinySegmenter + Google Translate (optimized)');
  
  const startTime = performance.now();
  
  try {
    // Initial segmentation with TinySegmenter
    const segmentationStart = performance.now();
    const rawSegments = segmenter.segment(text);
    console.log(`📝 Raw segments: ${rawSegments.length} (${(performance.now() - segmentationStart).toFixed(1)}ms)`);
    
    // Improve segmentation with post-processing
    const improveStart = performance.now();
    const improvedSegments = await improveSegmentation(rawSegments);
    console.log(`✨ Improved segments: ${improvedSegments.length} (${(performance.now() - improveStart).toFixed(1)}ms)`);
    
    // Generate tokens with optimized Google Translate calls
    const tokens: Token[] = [];
    let offset = 0;
    
    // 1. Filter out empty/whitespace-only segments and track positions
    const wordsToTranslate: Array<{word: string, start: number, end: number}> = [];
    for (const word of improvedSegments) {
      if (word.length === 0) continue;
      
      const start = offset;
      const end = start + word.length;
      offset = end;
      
      wordsToTranslate.push({ word: word.trim(), start, end });
    }
    
    console.log(`🔄 Processing ${wordsToTranslate.length} words for translation`);
    
    // 2. Check cache and separate cached vs uncached words
    const cachedTranslations = new Map<string, string>();
    const wordsNeedingTranslation: string[] = [];
    let cacheHits = 0;
    
    for (const { word } of wordsToTranslate) {
      if (word.trim() === '' || /^[\s　、。！？．，]+$/.test(word)) {
        // Skip punctuation/whitespace
        cachedTranslations.set(word, '');
        continue;
      }
      
      const cached = translationCache.get(word);
      if (cached !== undefined) {
        cachedTranslations.set(word, cached);
        cacheHits++;
      } else {
        wordsNeedingTranslation.push(word);
      }
    }
    
    console.log(`💾 Cache hits: ${cacheHits}/${wordsToTranslate.length} (${((cacheHits/wordsToTranslate.length)*100).toFixed(1)}%)`);
    
    // 3. Batch translate uncached words
    const newTranslations = new Map<string, string>();
    if (wordsNeedingTranslation.length > 0) {
      const translateStart = performance.now();
      
      // Split into smaller batches to avoid overwhelming the API (Google Translate has limits)
      const BATCH_SIZE = 50; // Conservative batch size
      const batches: string[][] = [];
      for (let i = 0; i < wordsNeedingTranslation.length; i += BATCH_SIZE) {
        batches.push(wordsNeedingTranslation.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`📦 Processing ${batches.length} batch(es) of max ${BATCH_SIZE} words each`);
      
      try {
        // Process batches in parallel (but limited batches to avoid API rate limits)
        const batchPromises = batches.map(async (batch, batchIndex) => {
          try {
            const response = await fetch('/api/translate/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                words: batch,
                target_lang: 'English',
                translation_service: 'google'
              })
            });
            
            if (response.ok) {
              const data = await response.json();
              return { batchIndex, translations: data.translations || {}, success: true };
            } else {
              console.warn(`⚠️ Batch ${batchIndex + 1} failed:`, response.status);
              return { batchIndex, translations: {}, success: false, batch };
            }
          } catch (error) {
            console.warn(`⚠️ Batch ${batchIndex + 1} error:`, error);
            return { batchIndex, translations: {}, success: false, batch };
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Process successful batch results
        let successfulBatches = 0;
        const failedWords: string[] = [];
        
        for (const result of batchResults) {
          if (result.success) {
            successfulBatches++;
            for (const [word, translation] of Object.entries(result.translations)) {
              newTranslations.set(word, translation as string);
              translationCache.set(word, translation as string);
            }
          } else if (result.batch) {
            failedWords.push(...result.batch);
          }
        }
        
        console.log(`🌐 Batch translated ${successfulBatches}/${batches.length} batches successfully (${(performance.now() - translateStart).toFixed(1)}ms)`);
        
                 // Handle failed words with individual parallel calls if needed
         if (failedWords.length > 0) {
           console.log(`🔄 Retrying ${failedWords.length} failed words individually`);
           const fallbackStart = performance.now();
           
           // Fallback: parallel individual calls with Promise.all()
           const translationPromises = failedWords.map(async (word) => {
             try {
               const response = await fetch('/api/translate/vocabulary', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                   content: word,
                   target_lang: 'English',
                   translation_service: 'google'
                 })
               });
               
               if (response.ok) {
                 const data = await response.json();
                 return { word, translation: data.translated_text || '' };
               }
             } catch (error) {
               console.warn(`⚠️ Translation failed for "${word}":`, error);
             }
             return { word, translation: '' };
           });
           
           const results = await Promise.all(translationPromises);
           for (const { word, translation } of results) {
             newTranslations.set(word, translation);
             translationCache.set(word, translation);
           }
           
           console.log(`🔄 Fallback translated ${failedWords.length} words (${(performance.now() - fallbackStart).toFixed(1)}ms)`);
         }
      } catch (error) {
        console.error('❌ Translation batch failed:', error);
        // Set empty translations for failed words
        for (const word of wordsNeedingTranslation) {
          newTranslations.set(word, '');
        }
      }
    }
    
    // 4. Create tokens with translations (cached + new)
    for (const { word, start, end } of wordsToTranslate) {
      const translation = cachedTranslations.get(word) ?? newTranslations.get(word) ?? '';
      
      const card: Card = {
        vid: 0,
        sid: 0,
        rid: 0,
        state: ['not-in-deck'],
        spelling: word,
        reading: word,
        frequencyRank: null,
        pitchAccent: [],
        meanings: translation ? [{
          glosses: [translation],
          partOfSpeech: ['unknown']
        }] : [{
          glosses: ['No translation available'],
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
    const cacheStats = translationCache.getStats();
    console.log(`✅ Generated ${tokens.length} tokens in ${totalTime.toFixed(1)}ms`);
    console.log(`📊 Cache: ${cacheStats.size}/${cacheStats.maxSize} entries`);
    
    // Check cache size and auto-clear if needed
    checkCacheSize();
    
    return tokens;
    
  } catch (error) {
    console.error('❌ Error in parseWithGoogleTranslate:', error);
    
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
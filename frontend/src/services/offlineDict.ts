export interface DictEntry {
  spelling: string;
  reading: string;
  jlpt?: string;
  pos: string[];
  vid?: number;
  meanings?: Meaning[];
  frequency?: number;
}

export interface Meaning {
  glosses: string[];
  partOfSpeech?: string[];
  info?: string[];
  tags?: string[];
}

// Jitendex format interface (Yomitan-style)
export interface JitendexEntry {
  term: string;
  reading: string;
  definitionTags?: string;
  rules?: string;
  score?: number;
  glossary: (string | JitendexGlossary)[];
  sequence?: number;
  termTags?: string;
}

export interface JitendexGlossary {
  type: string;
  content: string | any[];
}

const CACHE_KEY = 'offlineDictCache';
const JITENDEX_CACHE_KEY = 'jitendexDictCache';
let dict: DictEntry[] | null = null;
let dictMap: Record<string, DictEntry> | null = null;

// Enhanced dictionary loading that supports multiple formats
export async function loadDictionary(url: string = '/mini-dict.json'): Promise<DictEntry[]> {
  if (dict) return dict;
  
  // Try to load from cache first
  const stored = localStorage.getItem(CACHE_KEY);
  if (stored) {
    try {
      dict = JSON.parse(stored);
      buildMap();
      return dict as DictEntry[];
    } catch {
      // ignore parse error
    }
  }
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    // Check if this is Jitendex format (array of arrays) or simple format
    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      // Jitendex format
      dict = convertJitendexToDict(data);
    } else {
      // Simple format
      dict = data as DictEntry[];
    }
    
    buildMap();
    
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(dict));
    } catch {
      // ignore storage error
    }
    
    return dict;
  } catch (error) {
    console.error('Failed to load dictionary:', error);
    // Return empty array as fallback
    dict = [];
    return dict;
  }
}

// Convert Jitendex (Yomitan) format to our internal format
function convertJitendexToDict(jitendexData: any[]): DictEntry[] {
  const entries: DictEntry[] = [];
  
  for (const item of jitendexData) {
    if (!Array.isArray(item) || item.length < 6) continue;
    
    const [term, reading, definitionTags, rules, score, glossary, sequence, termTags] = item;
    
    // Extract meanings from glossary
    const meanings: Meaning[] = [];
    
    if (Array.isArray(glossary)) {
      // Group consecutive strings as a single meaning
      let currentMeaning: Meaning | null = null;
      
      for (const gloss of glossary) {
        if (typeof gloss === 'string') {
          if (!currentMeaning) {
            currentMeaning = { glosses: [gloss] };
          } else {
            currentMeaning.glosses.push(gloss);
          }
        } else if (typeof gloss === 'object' && gloss.type) {
          // Handle structured glossary entries
          if (currentMeaning) {
            meanings.push(currentMeaning);
            currentMeaning = null;
          }
          
          if (gloss.type === 'text' && gloss.content) {
            meanings.push({ glosses: [gloss.content] });
          }
        }
      }
      
      // Add the last meaning if it exists
      if (currentMeaning) {
        meanings.push(currentMeaning);
      }
    }
    
    // Parse part of speech from definition tags
    const pos: string[] = [];
    if (typeof definitionTags === 'string') {
      // Extract POS tags (this is simplified - Jitendex might have more complex tag parsing)
      const tags = definitionTags.split(' ');
      for (const tag of tags) {
        if (tag.match(/^(n|v|adj|adv|prt|exp|int|pref|suf)$/)) {
          pos.push(tag);
        }
      }
    }
    
    const entry: DictEntry = {
      spelling: term,
      reading: reading || term,
      pos: pos.length > 0 ? pos : ['unknown'],
      meanings: meanings.length > 0 ? meanings : [{ glosses: ['No definition available'] }],
      frequency: typeof score === 'number' ? score : undefined,
      vid: typeof sequence === 'number' ? sequence : undefined
    };
    
    entries.push(entry);
  }
  
  return entries;
}

export async function lookup(word: string): Promise<DictEntry | undefined> {
  if (!dict) await loadDictionary();
  if (!dictMap) buildMap();
  
  if (!dictMap) return undefined;
  
  // Direct lookup first
  let result = dictMap[word];
  if (result) return result;
  
  // Try variations for katakana/hiragana
  const variations = generateReadingVariations(word);
  for (const variation of variations) {
    result = dictMap[variation];
    if (result) return result;
  }
  
  return undefined;
}

function buildMap() {
  if (!dict) return;
  dictMap = {};
  for (const entry of dict) {
    dictMap[entry.spelling] = entry;
    // Also map by reading if different from spelling
    if (entry.reading && entry.reading !== entry.spelling) {
      dictMap[entry.reading] = entry;
    }
  }
}

// Generate reading variations (hiragana/katakana conversion)
function generateReadingVariations(word: string): string[] {
  const variations: string[] = [];
  
  // Convert hiragana to katakana
  const katakana = word.replace(/[\u3041-\u3096]/g, (match) => 
    String.fromCharCode(match.charCodeAt(0) + 0x60)
  );
  if (katakana !== word) variations.push(katakana);
  
  // Convert katakana to hiragana
  const hiragana = word.replace(/[\u30A1-\u30F6]/g, (match) => 
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
  if (hiragana !== word) variations.push(hiragana);
  
  return variations;
}

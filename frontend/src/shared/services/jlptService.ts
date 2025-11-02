// JLPT Vocabulary Lookup Service
import kanjiApiData from '~/data/jlpt/kanjiapi_full.json';

export interface KanjiEntry {
  freq_mainichi_shinbun?: number;
  grade?: number;
  heisig_en?: string;
  jlpt?: number; // 1-5, where 1 = N1, 5 = N5
  kanji: string;
  kun_readings: string[];
  meanings: string[];
  name_readings: string[];
  notes: string[];
  on_readings: string[];
  stroke_count: number;
  unicode: string;
}

export interface JlptWordInfo extends KanjiEntry {
  level: JlptLevel | null; // Computed JLPT level (N1, N2, N3, N4, N5)
}

export type JlptLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';

// Type-safe access to the kanji data
const kanjisData = (kanjiApiData as { kanjis: Record<string, KanjiEntry> }).kanjis;

// Combined dataset for fast searching (built on first access)
let allEntries: JlptWordInfo[] | null = null;

/**
 * Check if a character is a kanji
 */
function isKanji(char: string): boolean {
  const code = char.charCodeAt(0);
  // CJK Unified Ideographs: 4E00-9FFF
  // CJK Extension A: 3400-4DBF
  // CJK Extension B and beyond: 20000-2A6DF, etc.
  return (code >= 0x3400 && code <= 0x4DBF) || 
         (code >= 0x4E00 && code <= 0x9FFF) ||
         (code >= 0x20000 && code <= 0x2A6DF);
}

/**
 * Extract individual kanji characters from a word/phrase
 */
function extractKanji(text: string): string[] {
  return Array.from(text).filter(isKanji);
}

/**
 * Convert JLPT number to level string
 */
function jlptNumberToLevel(jlptNum: number | undefined): JlptLevel | null {
  if (!jlptNum) return null;
  switch (jlptNum) {
    case 1: return 'N1';
    case 2: return 'N2';
    case 3: return 'N3';
    case 4: return 'N4';
    case 5: return 'N5';
    default: return null;
  }
}

/**
 * Build the combined dataset with level information
 */
function buildCombinedDataset(): JlptWordInfo[] {
  if (allEntries) return allEntries;
  
  allEntries = [];
  
  for (const [kanjiChar, kanjiData] of Object.entries(kanjisData)) {
    allEntries.push({
      ...kanjiData,
      kanji: kanjiChar, // Ensure kanji field is set to the actual character
      level: jlptNumberToLevel(kanjiData.jlpt)
    });
  }
  
  console.log(`📚 JLPT Service: Loaded ${allEntries.length} kanji entries from kanjiapi_full.json`);
  const jlptCounts = allEntries.reduce((acc, entry) => {
    if (entry.level) {
      acc[entry.level] = (acc[entry.level] || 0) + 1;
    }
    return acc;
  }, {} as Record<JlptLevel, number>);
  console.log('📊 JLPT Level distribution:', jlptCounts);
  
  return allEntries;
}

/**
 * Get the meaning of a Japanese word/phrase by extracting kanji
 */
export function getMeaning(text: string): string | null {
  const kanjiChars = extractKanji(text);
  if (kanjiChars.length === 0) return null;
  
  const meanings: string[] = [];
  for (const kanji of kanjiChars) {
    const dataset = buildCombinedDataset();
    const entry = dataset.find(entry => entry.kanji === kanji);
    if (entry && entry.meanings.length > 0) {
      meanings.push(`${kanji}: ${entry.meanings.join(', ')}`);
    }
  }
  
  return meanings.length > 0 ? meanings.join(' | ') : null;
}

/**
 * Get the kun reading of kanji in a Japanese word/phrase
 */
export function getKunReading(text: string): string | null {
  const kanjiChars = extractKanji(text);
  if (kanjiChars.length === 0) return null;
  
  const readings: string[] = [];
  for (const kanji of kanjiChars) {
    const dataset = buildCombinedDataset();
    const entry = dataset.find(entry => entry.kanji === kanji);
    if (entry && entry.kun_readings.length > 0) {
      readings.push(`${kanji}: ${entry.kun_readings.join(', ')}`);
    }
  }
  
  return readings.length > 0 ? readings.join(' | ') : null;
}

/**
 * Get the on reading of kanji in a Japanese word/phrase
 */
export function getOnReading(text: string): string | null {
  const kanjiChars = extractKanji(text);
  if (kanjiChars.length === 0) return null;
  
  const readings: string[] = [];
  for (const kanji of kanjiChars) {
    const dataset = buildCombinedDataset();
    const entry = dataset.find(entry => entry.kanji === kanji);
    if (entry && entry.on_readings.length > 0) {
      readings.push(`${kanji}: ${entry.on_readings.join(', ')}`);
    }
  }
  
  return readings.length > 0 ? readings.join(' | ') : null;
}

/**
 * Get all readings (both kun and on) of kanji in a word/phrase
 */
export function getAllReadings(text: string): { kun: string[], on: string[] } | null {
  const kanjiChars = extractKanji(text);
  if (kanjiChars.length === 0) return null;
  
  const kunReadings: string[] = [];
  const onReadings: string[] = [];
  
  for (const kanji of kanjiChars) {
    const dataset = buildCombinedDataset();
    const entry = dataset.find(entry => entry.kanji === kanji);
    if (entry) {
      if (entry.kun_readings.length > 0) {
        kunReadings.push(`${kanji}: ${entry.kun_readings.join(', ')}`);
      }
      if (entry.on_readings.length > 0) {
        onReadings.push(`${kanji}: ${entry.on_readings.join(', ')}`);
      }
    }
  }
  
  return {
    kun: kunReadings,
    on: onReadings
  };
}

/**
 * Get complete kanji information for all kanji in a word/phrase
 */
export function getWordKanjiInfo(text: string): JlptWordInfo[] {
  const kanjiChars = extractKanji(text);
  const dataset = buildCombinedDataset();
  
  return kanjiChars
    .map(kanji => dataset.find(entry => entry.kanji === kanji))
    .filter((entry): entry is JlptWordInfo => entry !== undefined);
}

/**
 * Get complete kanji information for a single kanji character
 */
export function getKanjiInfo(kanji: string): JlptWordInfo | null {
  // If it's a single kanji character, look it up directly
  if (kanji.length === 1 && isKanji(kanji)) {
    const dataset = buildCombinedDataset();
    return dataset.find(entry => entry.kanji === kanji) || null;
  }
  
  // If it's a word/phrase, extract the first kanji
  const kanjiChars = extractKanji(kanji);
  if (kanjiChars.length > 0) {
    const dataset = buildCombinedDataset();
    return dataset.find(entry => entry.kanji === kanjiChars[0]) || null;
  }
  
  return null;
}

/**
 * Get the JLPT level of the highest-level kanji in a word/phrase
 */
export function getJlptLevel(text: string): JlptLevel | null {
  const kanjiInfos = getWordKanjiInfo(text);
  if (kanjiInfos.length === 0) return null;
  
  // Return the highest (most difficult) JLPT level found
  const levels = kanjiInfos
    .map(info => info.level)
    .filter((level): level is JlptLevel => level !== null);
  
  if (levels.length === 0) return null;
  
  // N1 is highest difficulty, N5 is lowest
  const levelOrder: JlptLevel[] = ['N1', 'N2', 'N3', 'N4', 'N5'];
  for (const level of levelOrder) {
    if (levels.includes(level)) {
      return level;
    }
  }
  
  return null;
}

/**
 * Get all entries for a specific JLPT level
 */
export function getEntriesByLevel(level: JlptLevel): JlptWordInfo[] {
  const dataset = buildCombinedDataset();
  return dataset.filter(entry => entry.level === level);
}

/**
 * Search for kanji containing a substring or matching criteria
 */
export function searchKanji(query: string): JlptWordInfo[] {
  const dataset = buildCombinedDataset();
  const lowerQuery = query.toLowerCase();
  
  return dataset.filter(entry => 
    entry.kanji.includes(query) || 
    entry.kun_readings.some(reading => reading.includes(query)) ||
    entry.on_readings.some(reading => reading.includes(query)) ||
    entry.meanings.some(meaning => meaning.toLowerCase().includes(lowerQuery)) ||
    (entry.heisig_en && entry.heisig_en.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Check if a text contains any kanji that exist in the database
 */
export function hasKanji(text: string): boolean {
  return getWordKanjiInfo(text).length > 0;
}

/**
 * Get kanji by stroke count
 */
export function getKanjiByStrokeCount(strokeCount: number): JlptWordInfo[] {
  const dataset = buildCombinedDataset();
  return dataset.filter(entry => entry.stroke_count === strokeCount);
}

/**
 * Get kanji by grade level
 */
export function getKanjiByGrade(grade: number): JlptWordInfo[] {
  const dataset = buildCombinedDataset();
  return dataset.filter(entry => entry.grade === grade);
}

/**
 * Get statistics about the loaded data
 */
export function getStats() {
  const dataset = buildCombinedDataset();
  const stats = {
    total: dataset.length,
    byLevel: {} as Record<JlptLevel, number>,
    byGrade: {} as Record<number, number>,
    withJlpt: 0,
    withoutJlpt: 0
  };
  
  for (const entry of dataset) {
    if (entry.level) {
      stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;
      stats.withJlpt++;
    } else {
      stats.withoutJlpt++;
    }
    
    if (entry.grade) {
      stats.byGrade[entry.grade] = (stats.byGrade[entry.grade] || 0) + 1;
    }
  }
  
  return stats;
}

// Legacy compatibility functions (maintaining old API)
/**
 * @deprecated Use getKunReading instead
 */
export function getReading(text: string): string | null {
  return getKunReading(text);
}

/**
 * @deprecated Use getKanjiInfo instead
 */
export function getWordInfo(text: string): JlptWordInfo | null {
  return getKanjiInfo(text);
}

/**
 * @deprecated Use searchKanji instead
 */
export function searchWords(query: string): JlptWordInfo[] {
  return searchKanji(query);
}

/**
 * @deprecated Use hasKanji instead
 */
export function hasWord(text: string): boolean {
  return hasKanji(text);
}


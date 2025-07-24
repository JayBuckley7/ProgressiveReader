export interface DictEntry {
  spelling: string;
  reading: string;
  jlpt: string;
  pos: string[];
  vid?: number;
}

const CACHE_KEY = 'offlineDictCache';
let dict: DictEntry[] | null = null;
let dictMap: Record<string, DictEntry> | null = null;

export async function loadDictionary(url: string = '/mini-dict.json'): Promise<DictEntry[]> {
  if (dict) return dict;
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
  const res = await fetch(url);
  const data = (await res.json()) as DictEntry[];
  dict = data;
  buildMap();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
  return data;
}

function buildMap() {
  if (!dict) return;
  dictMap = {};
  for (const entry of dict!) {
    dictMap[entry.spelling] = entry;
  }
}

export async function lookup(word: string): Promise<DictEntry | undefined> {
  if (!dict) await loadDictionary();
  if (!dictMap) buildMap();
  return dictMap ? dictMap[word] : undefined;
}

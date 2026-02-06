const ARTICLE_PREFIXES = ["a ", "an ", "the "];

// For gloss indexing we keep this set small and focused.
// Swap-time stopwords are broader and live in the swap module.
const PHRASE_STOPWORDS = new Set<string>([
  "a",
  "an",
  "the",
  "of",
  "to",
  "and",
  "or",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "by",
  "about",
  "into",
  "over",
  "under",
  "after",
  "before",
]);

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function stripParens(s: string): string {
  return s.replace(/\([^)]*\)/g, " ");
}

function stripLeadingArticles(s: string): string {
  for (const prefix of ARTICLE_PREFIXES) {
    if (s.startsWith(prefix)) return s.slice(prefix.length);
  }
  return s;
}

function looksVerbLike(s: string): boolean {
  return s.startsWith("to ") || s.startsWith("to-");
}

function isValidWord(w: string): boolean {
  return /^[a-z][a-z'-]+$/.test(w);
}

function isValidPhraseWords(words: string[]): boolean {
  if (words.length < 1 || words.length > 3) return false;
  for (const w of words) {
    if (!isValidWord(w)) return false;
    if (PHRASE_STOPWORDS.has(w)) return false;
  }
  return true;
}

export function extractEnglishNounGlosses(meanings: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const meaning of meanings || []) {
    if (typeof meaning !== "string") continue;

    // Remove parenthetical notes, then split on common separators.
    const cleaned = stripParens(meaning).replace(/[_]/g, " ");
    const parts = cleaned.split(/[;/,]/g);

    for (const raw of parts) {
      let seg = normalizeWhitespace(raw.toLowerCase());
      if (!seg) continue;

      if (looksVerbLike(seg)) continue;
      seg = stripLeadingArticles(seg);
      seg = normalizeWhitespace(seg);
      if (!seg) continue;

      const words = seg.split(" ").filter(Boolean);
      if (!isValidPhraseWords(words)) continue;

      const gloss = words.join(" ");
      if (gloss.length < 2) continue;
      if (seen.has(gloss)) continue;
      seen.add(gloss);
      out.push(gloss);
    }
  }

  return out;
}


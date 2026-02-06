import type { ReactElement } from "react";
import type { JpdbKnownVocabRecord } from "@features/jpdbMirror/types";

const EN_STOPWORDS = new Set<string>([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "when",
  "while",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "onto",
  "over",
  "under",
  "to",
  "with",
  "without",
  "about",
  "above",
  "below",
  "between",
  "before",
  "after",
  "during",
  "through",
  "across",
  "around",
  "near",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "doing",
  "have",
  "has",
  "had",
  "having",
  "can",
  "could",
  "may",
  "might",
  "must",
  "shall",
  "should",
  "will",
  "would",
  "i",
  "me",
  "my",
  "mine",
  "we",
  "us",
  "our",
  "ours",
  "you",
  "your",
  "yours",
  "he",
  "him",
  "his",
  "she",
  "her",
  "hers",
  "it",
  "its",
  "they",
  "them",
  "their",
  "theirs",
  "this",
  "that",
  "these",
  "those",
  "here",
  "there",
  "who",
  "whom",
  "whose",
  "what",
  "which",
  "why",
  "how",
  "not",
  "no",
  "yes",
  "all",
  "any",
  "some",
  "none",
  "each",
  "every",
  "either",
  "neither",
  "both",
  "few",
  "many",
  "much",
  "more",
  "most",
  "less",
  "least",
  "very",
  "just",
  "only",
  "also",
  "even",
  "still",
  "too",
  "so",
  "than",
  "because",
  "since",
  "until",
  "again",
  "once",
  "up",
  "down",
  "out",
  "off",
  "on",
  "away",
  "back",
]);

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableRand01(input: string): number {
  return fnv1a32(input) / 4294967296; // 2^32
}

function normalizePossessive(wordLower: string): { base: string; isPossessive: boolean } {
  if (wordLower.endsWith("'s")) return { base: wordLower.slice(0, -2), isPossessive: true };
  if (wordLower.endsWith("’s")) return { base: wordLower.slice(0, -2), isPossessive: true };
  return { base: wordLower, isPossessive: false };
}

function singularizeLastWord(wordLower: string): string[] {
  const out: string[] = [];
  if (wordLower.length < 3) return out;
  if (wordLower.endsWith("ies") && wordLower.length > 3) {
    out.push(wordLower.slice(0, -3) + "y");
  }
  if (wordLower.endsWith("es") && wordLower.length > 2) {
    out.push(wordLower.slice(0, -2));
  }
  if (wordLower.endsWith("s") && wordLower.length > 2) {
    out.push(wordLower.slice(0, -1));
  }
  return out;
}

function isCloseCandidate(a: JpdbKnownVocabRecord, b: JpdbKnownVocabRecord): boolean {
  const aRank = typeof a.frequencyRank === "number" ? a.frequencyRank : null;
  const bRank = typeof b.frequencyRank === "number" ? b.frequencyRank : null;
  if (aRank === null && bRank === null) return true;
  if (aRank === null || bRank === null) return false;
  return Math.floor(aRank / 500) === Math.floor(bRank / 500);
}

type WordToken = {
  text: string;
  lower: string;
  start: number;
  end: number;
  hasHyphen: boolean;
  isPossessive: boolean;
  baseLower: string;
};

function tokenizeWords(text: string): WordToken[] {
  const re = /[A-Za-z]+(?:['’\\-][A-Za-z]+)*/g;
  const tokens: WordToken[] = [];
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(text))) {
    const raw = match[0];
    const lower = raw.toLowerCase();
    const { base, isPossessive } = normalizePossessive(lower);
    tokens.push({
      text: raw,
      lower,
      start: match.index,
      end: match.index + raw.length,
      hasHyphen: raw.includes("-"),
      isPossessive,
      baseLower: base,
    });
  }

  return tokens;
}

function pickCandidateForGloss(args: {
  glossKey: string;
  glossIndex: Map<string, string[]>;
  vocabById: Map<string, JpdbKnownVocabRecord>;
  refinedChoices?: Map<string, string | null>;
  onAmbiguous?: (glossKey: string) => void;
}): { record: JpdbKnownVocabRecord | null; chosenId: string | null } {
  const refined = args.refinedChoices?.get(args.glossKey);
  if (refined === null) return { record: null, chosenId: null };
  if (typeof refined === "string") {
    const r = args.vocabById.get(refined);
    return { record: r ?? null, chosenId: r ? refined : null };
  }

  const candidateIds = args.glossIndex.get(args.glossKey) ?? [];
  if (candidateIds.length === 0) return { record: null, chosenId: null };

  const first = args.vocabById.get(candidateIds[0]);
  if (!first) return { record: null, chosenId: null };

  if (candidateIds.length >= 2) {
    const second = args.vocabById.get(candidateIds[1]);
    if (second && isCloseCandidate(first, second)) {
      args.onAmbiguous?.(args.glossKey);
      return { record: null, chosenId: null };
    }
  }

  return { record: first, chosenId: candidateIds[0] };
}

function buildGlossKeyVariants(words: WordToken[], startIdx: number, len: number): Array<{ key: string; lastWordVariantUsed: boolean }> {
  const slice = words.slice(startIdx, startIdx + len);
  const baseWords = slice.map((w) => w.baseLower);
  const baseKey = baseWords.join(" ");
  const out: Array<{ key: string; lastWordVariantUsed: boolean }> = [{ key: baseKey, lastWordVariantUsed: false }];

  const last = baseWords[baseWords.length - 1] || "";
  for (const v of singularizeLastWord(last)) {
    const next = baseWords.slice();
    next[next.length - 1] = v;
    out.push({ key: next.join(" "), lastWordVariantUsed: true });
  }
  return out;
}

function shouldBlockWordToken(token: WordToken): boolean {
  if (token.hasHyphen) return true;
  if (token.isPossessive) return true;
  return false;
}

function isSwapEligibleGlossKey(glossKey: string): boolean {
  if (!glossKey) return false;
  const parts = glossKey.split(" ").filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return false;
  for (const p of parts) {
    if (EN_STOPWORDS.has(p)) return false;
  }
  return true;
}

export interface SwapHighlighter {
  highlightFn: (text: string) => Array<ReactElement | string>;
  getAmbiguousGlosses: () => string[];
  clearAmbiguousGlosses: () => void;
}

export function createEnglishSwapHighlighter(args: {
  bookId: string;
  chapter: number;
  aggression: number;
  glossIndex: Map<string, string[]>;
  vocabById: Map<string, JpdbKnownVocabRecord>;
  refinedChoices?: Map<string, string | null>;
}): SwapHighlighter {
  const ambiguous = new Set<string>();
  let nodeIndex = 0;

  const onAmbiguous = (glossKey: string) => ambiguous.add(glossKey);

  const highlightFn = (text: string): Array<ReactElement | string> => {
    const currentNode = nodeIndex;
    nodeIndex += 1;

    // Fast path: no Latin letters => no swaps.
    if (!/[A-Za-z]/.test(text)) return [text];

    const words = tokenizeWords(text);
    if (words.length === 0) return [text];

    const actions: Array<{ start: number; end: number; replacement: string }> = [];

    let i = 0;
    let matchOrdinal = 0;
    while (i < words.length) {
      const w = words[i];
      if (shouldBlockWordToken(w)) {
        i += 1;
        continue;
      }

      let matched = false;
      for (let len = 3; len >= 1; len -= 1) {
        if (i + len > words.length) continue;

        const spanStart = words[i].start;
        const spanEnd = words[i + len - 1].end;

        // Block if any part is blocked.
        let blocked = false;
        for (let j = i; j < i + len; j += 1) {
          if (shouldBlockWordToken(words[j])) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        const variants = buildGlossKeyVariants(words, i, len);
        let chosen: { key: string; record: JpdbKnownVocabRecord | null } | null = null;
        for (const v of variants) {
          const glossKey = v.key;
          if (!isSwapEligibleGlossKey(glossKey)) continue;

          const { record } = pickCandidateForGloss({
            glossKey,
            glossIndex: args.glossIndex,
            vocabById: args.vocabById,
            refinedChoices: args.refinedChoices,
            onAmbiguous,
          });
          if (record) {
            chosen = { key: glossKey, record };
            break;
          }
        }
        if (!chosen || !chosen.record) continue;

        const seed = `${args.bookId}:${args.chapter}|${currentNode}|${matchOrdinal}|${chosen.key}`;
        const r = stableRand01(seed);
        if (r >= Math.max(0, Math.min(1, args.aggression))) {
          matchOrdinal += 1;
          i += len;
          matched = true;
          break;
        }

        actions.push({ start: spanStart, end: spanEnd, replacement: chosen.record.spelling });
        matchOrdinal += 1;
        i += len;
        matched = true;
        break;
      }

      if (!matched) i += 1;
    }

    if (actions.length === 0) return [text];

    actions.sort((a, b) => a.start - b.start);
    let out = "";
    let cursor = 0;
    for (const a of actions) {
      if (a.start < cursor) continue; // should not happen
      out += text.slice(cursor, a.start);
      out += a.replacement;
      cursor = a.end;
    }
    out += text.slice(cursor);

    return [out];
  };

  return {
    highlightFn,
    getAmbiguousGlosses: () => Array.from(ambiguous.values()).sort(),
    clearAmbiguousGlosses: () => ambiguous.clear(),
  };
}

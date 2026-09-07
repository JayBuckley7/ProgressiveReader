export const DEFAULT_SEGMENT_CODE_POINTS = 1_500;

export interface SourceBlock {
  /** A source-stable key, such as an EPUB element id or DOM path. */
  key?: string;
  text: string;
}

export interface SourceSegment {
  id: string;
  sourceHash: string;
  ordinal: number;
  text: string;
  codePointLength: number;
  sourceStart: number;
  sourceEnd: number;
  blockKeys: string[];
}

export interface SegmentSourceOptions {
  targetCodePoints?: number;
  locale?: string;
  idPrefix?: string;
  /** Keep each supplied block atomic; useful after HTML blocks have been annotated. */
  splitLongBlocks?: boolean;
}

interface SentenceUnit {
  start: number;
  end: number;
  blockIndex: number;
}

const SENTENCE_END = new Set([".", "!", "?", "。", "！", "？", "…"]);
const CLOSING_PUNCTUATION = new Set(["\"", "'", "”", "’", "」", "』", "】", "）", ")", "]"]);
const SOFT_BREAK = /[\s,;、，；:：.!?。！？…]/u;

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** Synchronous UTF-8 SHA-256 for stable source/cache identity in render-time code. */
export function stableSourceHash(value: string): string {
  const bytes = Array.from(new TextEncoder().encode(value));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const highBits = Math.floor(bitLength / 0x1_0000_0000);
  const lowBits = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((highBits >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((lowBits >>> shift) & 0xff);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Array<number>(64).fill(0);

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let index = 0; index < 16; index += 1) {
      const offset = chunk + index * 4;
      words[index] = (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15];
      const second = words[index - 2];
      const sigma0 = rotateRight(first, 7) ^ rotateRight(first, 18) ^ (first >>> 3);
      const sigma1 = rotateRight(second, 17) ^ rotateRight(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const choice = (e & f) ^ (~e & g);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const temp1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function normalizeSourceText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v\u00a0 ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();
}

export function sourceBlocksFromText(value: string): SourceBlock[] {
  const normalized = normalizeSourceText(value);
  if (!normalized) return [];
  return normalized
    .split(/\n{2,}/gu)
    .map((text, index) => ({ key: `block-${index}`, text: text.replace(/\n+/gu, " ").trim() }))
    .filter((block) => block.text.length > 0);
}

function sentenceRangesFallback(text: string): Array<{ start: number; end: number }> {
  const characters = Array.from(text);
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;

  for (let index = 0; index < characters.length; index += 1) {
    if (!SENTENCE_END.has(characters[index])) continue;

    let end = index + 1;
    while (end < characters.length && SENTENCE_END.has(characters[end])) end += 1;
    while (end < characters.length && CLOSING_PUNCTUATION.has(characters[end])) end += 1;
    while (end < characters.length && /\s/u.test(characters[end])) end += 1;
    ranges.push({ start, end });
    start = end;
    index = end - 1;
  }

  if (start < characters.length) ranges.push({ start, end: characters.length });
  return ranges;
}

function utf16IndexToCodePointIndex(value: string, utf16Index: number): number {
  return codePointLength(value.slice(0, utf16Index));
}

function sentenceRanges(text: string, locale?: string): Array<{ start: number; end: number }> {
  type SentenceSegment = { index: number; segment: string };
  type SentenceSegmenter = {
    segment: (value: string) => Iterable<SentenceSegment>;
  };
  type SentenceSegmenterConstructor = new (
    locale?: string,
    options?: { granularity: "sentence" }
  ) => SentenceSegmenter;
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SentenceSegmenterConstructor }).Segmenter;
  if (typeof Segmenter !== "function") return sentenceRangesFallback(text);

  try {
    const segmenter = new Segmenter(locale, { granularity: "sentence" });
    const entries = Array.from(segmenter.segment(text));
    if (entries.length === 0) return sentenceRangesFallback(text);
    return entries.map((entry, index) => ({
      start: utf16IndexToCodePointIndex(text, entry.index),
      end: utf16IndexToCodePointIndex(text, entries[index + 1]?.index ?? text.length),
    }));
  } catch {
    return sentenceRangesFallback(text);
  }
}

function splitLongRange(
  source: readonly string[],
  range: { start: number; end: number },
  target: number
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const minimumSearch = Math.max(1, Math.floor(target * 0.65));
  let start = range.start;

  while (range.end - start > target) {
    const idealEnd = Math.min(range.end, start + target);
    let end = idealEnd;
    for (let candidate = idealEnd; candidate > start + minimumSearch; candidate -= 1) {
      if (SOFT_BREAK.test(source[candidate - 1] ?? "")) {
        end = candidate;
        break;
      }
    }
    ranges.push({ start, end });
    start = end;
  }

  if (start < range.end) ranges.push({ start, end: range.end });
  return ranges;
}

function normalizeBlocks(source: string | readonly SourceBlock[]): SourceBlock[] {
  if (typeof source === "string") return sourceBlocksFromText(source);
  return source
    .map((block, index) => ({
      key: block.key?.trim() || `block-${index}`,
      text: normalizeSourceText(block.text).replace(/\n+/gu, " "),
    }))
    .filter((block) => block.text.length > 0);
}

/**
 * Builds deterministic, block- and sentence-aware source segments. Page layout is
 * deliberately not part of the id so the same source produces the same segments
 * at every viewport and font size.
 */
export function buildSourceSegments(
  source: string | readonly SourceBlock[],
  options: SegmentSourceOptions = {}
): SourceSegment[] {
  const target = Math.max(64, Math.trunc(options.targetCodePoints ?? DEFAULT_SEGMENT_CODE_POINTS));
  const minimum = Math.max(1, Math.floor(target * 0.65));
  const maximum = Math.max(target, Math.floor(target * 1.25));
  const blocks = normalizeBlocks(source);
  if (blocks.length === 0) return [];

  const normalizedSource = blocks.map((block) => block.text).join("\n\n");
  const sourceCharacters = Array.from(normalizedSource);
  const chapterHash = stableSourceHash(normalizedSource);
  const units: SentenceUnit[] = [];
  let blockStart = 0;

  blocks.forEach((block, blockIndex) => {
    const blockCharacters = Array.from(block.text);
    if (options.splitLongBlocks === false) {
      units.push({
        start: blockStart,
        end: blockStart + blockCharacters.length,
        blockIndex,
      });
    } else {
      sentenceRanges(block.text, options.locale).forEach((range) => {
        splitLongRange(blockCharacters, range, target).forEach((part) => {
          units.push({
            start: blockStart + part.start,
            end: blockStart + part.end,
            blockIndex,
          });
        });
      });
    }
    blockStart += blockCharacters.length + (blockIndex < blocks.length - 1 ? 2 : 0);
  });

  const grouped: SentenceUnit[][] = [];
  let current: SentenceUnit[] = [];
  let currentLength = 0;

  const flush = () => {
    if (current.length > 0) grouped.push(current);
    current = [];
    currentLength = 0;
  };

  units.forEach((unit) => {
    const unitLength = unit.end - unit.start;
    const crossesBlock = current.length > 0 && current[current.length - 1].blockIndex !== unit.blockIndex;
    if (
      current.length > 0 &&
      ((crossesBlock && currentLength >= minimum) ||
        currentLength + unitLength > maximum ||
        (currentLength >= minimum && currentLength + unitLength > target))
    ) {
      flush();
    }

    current.push(unit);
    currentLength += unitLength;
    if (currentLength >= maximum) flush();
  });
  flush();

  const idPrefix = (options.idPrefix ?? "pr-seg").replace(/[^a-zA-Z0-9_-]/gu, "-");
  return grouped.map((group, ordinal) => {
    const sourceStart = group[0].start;
    const sourceEnd = group[group.length - 1].end;
    const text = sourceCharacters.slice(sourceStart, sourceEnd).join("");
    const blockKeys = Array.from(
      new Set(group.map((unit) => blocks[unit.blockIndex]?.key ?? `block-${unit.blockIndex}`))
    );
    const segmentHash = stableSourceHash(`${blockKeys.join("|")}\n${text}`);
    return {
      id: `${idPrefix}-${chapterHash.slice(0, 16)}-${sourceStart.toString(36)}-${segmentHash.slice(0, 16)}`,
      sourceHash: stableSourceHash(text),
      ordinal,
      text,
      codePointLength: sourceEnd - sourceStart,
      sourceStart,
      sourceEnd,
      blockKeys,
    };
  });
}

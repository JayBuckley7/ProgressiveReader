import type { BookMetadata, ReadingProgress } from "~/types";
import type { GrammarPoint } from "@features/grammar/data/grammarCatalog";
import type { GrammarExample, GrammarScanBoundary } from "@features/grammar/types";
import { validateGrammarCandidates, type GrammarValidateCandidate } from "@features/grammar/services/grammarApi";
import { extractPlainTextFromHtml, limitSentencesByPercent, looksJapanese, splitIntoSentences } from "@features/grammar/services/grammarText";
import { fnv1a32 } from "@features/grammar/services/hash";

import { bookStorageService } from "@features/books/services/bookStorage";
import { EpubProcessorWrapper } from "@shared/lib/epubProcessor";
import { TextProcessorWrapper } from "@shared/lib/textProcessor";

type MinerBudgets = {
  maxBooks: number;
  maxChapters: number;
  maxCandidates: number;
  maxExtractedTextChars: number;
};

const DEFAULT_BUDGETS: MinerBudgets = {
  // Default was intentionally conservative, but users with larger libraries expect a full sweep.
  // Still bounded to avoid runaway costs/time; can be overridden via args.budgets.
  maxBooks: 50,
  maxChapters: 25,
  maxCandidates: 25,
  maxExtractedTextChars: 200_000,
};

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getLocalReadingProgress(bookId: string): ReadingProgress | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`reading_progress_${bookId}`);
  const parsed = safeJsonParse<any>(raw);
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.currentChapter !== "number") return null;
  return parsed as ReadingProgress;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function percentFromProgress(progress: ReadingProgress | null): number {
  if (!progress) return 0;
  const scrollTop = (progress as any).currentPosition;
  const scrollHeight = (progress as any).scrollHeight;
  const viewportHeight = (progress as any).viewportHeight;
  if (!Number.isFinite(scrollTop) || !Number.isFinite(scrollHeight) || !Number.isFinite(viewportHeight)) return 0;
  const denom = Math.max(1, Number(scrollHeight) - Number(viewportHeight));
  return clamp01(Number(scrollTop) / denom);
}

function boundaryForBook(meta: BookMetadata, progress: ReadingProgress | null): GrammarScanBoundary {
  if (meta.fileType === "pdf") {
    const page = (progress as any)?.currentPage;
    if (typeof page === "number" && page > 0) {
      return { uptoChapter: Math.max(0, page - 1), uptoPage: page };
    }
    return { uptoChapter: 0, uptoPage: 1 };
  }

  if (progress) {
    const percent = percentFromProgress(progress);
    return {
      uptoChapter: Math.max(0, Number(progress.currentChapter) || 0),
      uptoPercent: percent > 0 ? percent : 0.1,
    };
  }

  return { uptoChapter: 0, uptoPercent: 0.05 };
}

function boundaryAdvances(prev: GrammarScanBoundary | undefined, next: GrammarScanBoundary): boolean {
  if (!prev) return true;
  if (next.uptoChapter > prev.uptoChapter) return true;
  if (next.uptoChapter < prev.uptoChapter) return false;
  const prevP = typeof prev.uptoPercent === "number" ? prev.uptoPercent : 1;
  const nextP = typeof next.uptoPercent === "number" ? next.uptoPercent : 1;
  if (nextP > prevP + 1e-6) return true;
  return false;
}

function getCachedTranslationHtml(bookId: string, chapter: number): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`translation_${bookId}_${chapter}`);
  const parsed = safeJsonParse<any>(raw);
  const html = parsed?.content;
  return typeof html === "string" && html.trim() ? html : null;
}

function buildCandidatesFromSentences(
  sentencesAll: string[],
  grammar: GrammarPoint,
  opts: {
    bookId: string;
    chapterIndex: number;
    maxCandidates: number;
  }
): GrammarValidateCandidate[] {
  if (grammar.hintQuality !== "ok") return [];

  const hints = (grammar.hints || []).filter((h) => typeof h === "string" && h.length > 0);
  if (!hints.length) return [];

  const candidates: GrammarValidateCandidate[] = [];
  for (let i = 0; i < sentencesAll.length; i++) {
    if (candidates.length >= opts.maxCandidates) break;
    const sentence = sentencesAll[i];
    if (!sentence) continue;

    let hitHint: string | null = null;
    let hitIndex = -1;
    for (const h of hints) {
      const idx = sentence.indexOf(h);
      if (idx >= 0) {
        hitHint = h;
        hitIndex = idx;
        break;
      }
    }
    if (!hitHint || hitIndex < 0) continue;

    const before = sentencesAll[i - 1];
    const after = sentencesAll[i + 1];

    candidates.push({
      id: `${opts.bookId}:${opts.chapterIndex}:${i}`,
      sentence: sentence.slice(0, 300),
      before: before ? before.slice(0, 300) : undefined,
      after: after ? after.slice(0, 300) : undefined,
      hintSpan: { start: hitIndex, end: hitIndex + hitHint.length, text: hitHint },
    });
  }
  return candidates;
}

export async function mineLibraryForGrammarExamples(args: {
  grammar: GrammarPoint;
  books: BookMetadata[];
  alreadyScannedBoundaries?: Record<string, GrammarScanBoundary>;
  budgets?: Partial<MinerBudgets>;
  maxExamples?: number;
  signal?: AbortSignal;
  onProgress?: (p: { booksScanned: number; booksTotal: number; chaptersScanned: number }) => void;
}): Promise<{
  examples: GrammarExample[];
  scannedBoundaries: Record<string, GrammarScanBoundary>;
  stats: { booksScanned: number; booksTotal: number; chaptersScanned: number };
}> {
  const budgets: MinerBudgets = { ...DEFAULT_BUDGETS, ...(args.budgets || {}) };
  const maxExamples = Math.max(1, Math.min(3, args.maxExamples ?? 3));

  const scannedBoundaries: Record<string, GrammarScanBoundary> = {};

  // Order books by progress (local only for MVP).
  const scored = args.books
    .filter((b) => b && typeof b.id === "string" && b.id && b.fileType !== "pdf")
    .map((b) => {
      const progress = getLocalReadingProgress(b.id);
      const hasProgress = Boolean(progress);
      const score = (progress?.currentChapter ?? 0) + percentFromProgress(progress);
      return { book: b, hasProgress, score };
    })
    .sort((a, b) => {
      if (a.hasProgress !== b.hasProgress) return a.hasProgress ? -1 : 1;
      return (b.score ?? 0) - (a.score ?? 0);
    });

  const booksToScan = scored.slice(0, Math.max(0, budgets.maxBooks));
  const booksTotal = booksToScan.length;

  let booksScanned = 0;
  let chaptersScanned = 0;
  let extractedChars = 0;

  const allCandidates: GrammarValidateCandidate[] = [];

  for (const entry of booksToScan) {
    if (args.signal?.aborted) break;
    if (allCandidates.length >= budgets.maxCandidates) break;

    const meta = entry.book;
    const progress = getLocalReadingProgress(meta.id);
    const boundary = boundaryForBook(meta, progress);
    scannedBoundaries[meta.id] = boundary;

    const prevBoundary = args.alreadyScannedBoundaries?.[meta.id];
    if (prevBoundary && !boundaryAdvances(prevBoundary, boundary)) {
      continue;
    }

    booksScanned += 1;
    args.onProgress?.({ booksScanned, booksTotal, chaptersScanned });

    // Download book content and parse chapters.
    const blob = await bookStorageService.downloadBook(meta.id, meta);
    if (args.signal?.aborted) break;
    if (!blob) continue;
    const buf = await blob.arrayBuffer();
    if (args.signal?.aborted) break;

    const processor = meta.fileType === "epub" ? new EpubProcessorWrapper() : new TextProcessorWrapper();
    const ok = meta.fileType === "epub" ? await processor.loadBook(buf) : await processor.loadBook(buf, { fileType: meta.fileType });
    if (args.signal?.aborted) break;
    if (!ok) continue;

    const totalChapters = processor.getTotalChapters();
    const lastChapter = Math.min(Math.max(0, boundary.uptoChapter), Math.max(0, totalChapters - 1));

    for (let ch = 0; ch <= lastChapter; ch++) {
      if (args.signal?.aborted) break;
      if (allCandidates.length >= budgets.maxCandidates) break;
      if (chaptersScanned >= budgets.maxChapters) break;
      if (extractedChars >= budgets.maxExtractedTextChars) break;

      const percent = ch < lastChapter ? 1 : (boundary.uptoPercent ?? 0.1);

      // Prefer cached translation if it looks Japanese.
      let textToUse: string | null = null;
      const cached = getCachedTranslationHtml(meta.id, ch);
      if (cached) {
        const extracted = extractPlainTextFromHtml(cached);
        if (looksJapanese(extracted)) textToUse = extracted;
      }

      if (!textToUse) {
        const html = await processor.getChapterHtml(ch);
        if (args.signal?.aborted) break;
        if (!html) continue;
        const extracted = extractPlainTextFromHtml(html);
        if (!looksJapanese(extracted)) continue;
        textToUse = extracted;
      }

      chaptersScanned += 1;
      extractedChars += textToUse.length;
      args.onProgress?.({ booksScanned, booksTotal, chaptersScanned });

      const sentences = splitIntoSentences(textToUse);
      const limited = limitSentencesByPercent(sentences, percent);

      const candidates = buildCandidatesFromSentences(limited, args.grammar, {
        bookId: meta.id,
        chapterIndex: ch,
        maxCandidates: budgets.maxCandidates - allCandidates.length,
      });
      allCandidates.push(...candidates);
    }
  }

  if (!allCandidates.length) {
    return {
      examples: [],
      scannedBoundaries,
      stats: { booksScanned, booksTotal, chaptersScanned },
    };
  }

  const apiKey = (typeof window !== "undefined" ? (localStorage.getItem("openaiKey") || "") : "") || "";
  const model = (typeof window !== "undefined" ? (localStorage.getItem("openaiModel") || "") : "") || "gpt-4o-mini";

  const resp = await validateGrammarCandidates(
    {
      grammar: {
        id: args.grammar.id,
        title: args.grammar.title,
        meaning: args.grammar.meaning,
        level: args.grammar.level,
      },
      candidates: allCandidates,
      maxResults: maxExamples,
      model,
      apiKey: apiKey || undefined,
    },
    { signal: args.signal }
  );

  const nowIso = new Date().toISOString();
  const examples: GrammarExample[] = [];

  const byId = new Map<string, GrammarValidateCandidate>();
  for (const c of allCandidates) byId.set(c.id, c);

  for (const m of resp.matches || []) {
    if (examples.length >= maxExamples) break;
    if (!m?.isMatch) continue;
    const cand = byId.get(m.candidateId);
    if (!cand) continue;
    const span = m.matchSpan;
    if (!span || typeof span.start !== "number" || typeof span.end !== "number") continue;
    const sentence = cand.sentence || "";
    const start = Math.max(0, Math.min(sentence.length, span.start));
    const end = Math.max(start, Math.min(sentence.length, span.end));
    const text = typeof span.text === "string" && span.text ? span.text : sentence.slice(start, end);

    const idSeed = `${args.grammar.id}|${cand.id}|${sentence}|${start}|${end}`;
    const id = fnv1a32(idSeed);

    examples.push({
      id,
      grammarId: args.grammar.id,
      grammarTitle: args.grammar.title,
      grammarMeaning: args.grammar.meaning,
      grammarLevel: args.grammar.level,
      bookId: cand.id.split(":")[0] || "",
      chapterIndex: Number(cand.id.split(":")[1] || 0),
      sentence,
      before: cand.before,
      after: cand.after,
      match: { start, end, text },
      explanation: typeof m.explanation === "string" ? m.explanation : undefined,
      confidence: typeof m.confidence === "number" ? Math.max(0, Math.min(1, m.confidence)) : 0.6,
      createdAt: nowIso,
    });
  }

  return {
    examples,
    scannedBoundaries,
    stats: { booksScanned, booksTotal, chaptersScanned },
  };
}

import type { GrammarLevel } from "@features/grammar/data/grammarCatalog";

export type GrammarExampleMatchSpan = {
  start: number;
  end: number;
  text: string;
};

export type GrammarExample = {
  id: string; // hash(grammarId|bookId|chapterIndex|sentence|match.start|match.end)
  grammarId: string;
  grammarTitle: string;
  grammarMeaning: string;
  grammarLevel: GrammarLevel;

  bookId: string;
  chapterIndex: number;

  sentence: string;
  before?: string;
  after?: string;

  match: GrammarExampleMatchSpan;
  explanation?: string;
  confidence: number; // 0..1
  createdAt: string; // ISO
};

export type GrammarScanBoundary = {
  uptoChapter: number;
  uptoPercent?: number;
  uptoPage?: number;
};

export type GrammarScanStatus = "idle" | "queued" | "scanning" | "complete" | "not_found_yet" | "error";

export type GrammarScanState = {
  status: GrammarScanStatus;
  lastScanAt?: string;
  lastError?: string;
  scannedBoundaries?: Record<string, GrammarScanBoundary>;
  progress?: { booksScanned: number; booksTotal: number; chaptersScanned: number };
};

export type GrammarStateV2 = {
  version: 2;
  knownIds: string[];
  learningIds: string[];
  examplesByGrammarId: Record<string, GrammarExample[]>;
  scanByGrammarId?: Record<string, GrammarScanState>;
  lastUpdatedMs: number;
};


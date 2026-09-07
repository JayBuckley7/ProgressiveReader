import type { GrammarValidateRequest, GrammarValidateResponse } from "@core/grammar/validateCandidates";
import type { TeachExampleRequest, TeachExampleResponse } from "@core/grammar/teachExamples";
import type { MixRefineBackendPort, RefineChoices } from "@core/mix/refineAmbiguousSwaps";
import type { AddBookmarkRequest, Bookmark, GetBookmarksRequest, TranslateRequest, TranslateResponse } from "~/types/api";

export interface TranslationBackendPort {
  translateChapter(req: TranslateRequest, opts?: { signal?: AbortSignal }): Promise<TranslateResponse>;
  translateChapterStream(
    req: TranslateRequest,
    onChunk?: (chunk: string) => void,
    onComplete?: (complete: string) => void,
    opts?: { signal?: AbortSignal }
  ): AsyncGenerator<string, void, unknown>;
}

export interface GrammarBackendPort {
  validateExamples(
    request: Omit<GrammarValidateRequest, "apiKey">,
    opts?: { signal?: AbortSignal }
  ): Promise<GrammarValidateResponse>;

  teachExamples(
    request: Omit<TeachExampleRequest, "apiKey">,
    opts?: { signal?: AbortSignal }
  ): Promise<TeachExampleResponse>;
}

export interface OpenAiKeyBackendPort {
  isOpenAiKeyConfigured(opts?: { signal?: AbortSignal }): Promise<boolean>;
}

export interface JlptBackendPort {
  setJlptHighlightingEnabled(args: { enabled: boolean; signal?: AbortSignal }): Promise<boolean>;
}

export interface BookmarksBackendPort {
  getBookmarks(request: GetBookmarksRequest, opts?: { signal?: AbortSignal }): Promise<Bookmark[]>;
  addBookmark(request: AddBookmarkRequest, opts?: { signal?: AbortSignal }): Promise<Bookmark>;
}

export interface CoversBackendPort {
  lookupCover(args: { title: string; signal?: AbortSignal }): Promise<Blob | undefined>;
}

export type ImportedLyrics = {
  title: string;
  artist: string;
  text: string;
  source_url: string;
};

export interface LyricsBackendPort {
  importKanjiLyrics(args: { url: string; signal?: AbortSignal }): Promise<ImportedLyrics>;
}

export type OcrProgress = {
  type: "progress" | "complete" | "error";
  page?: number;
  total?: number;
  percent?: number;
  pdf?: string;
  filename?: string;
  error?: string;
  [key: string]: unknown;
};

export type OcrProgressCallback = (progress: OcrProgress) => void;

export type OcrLayoutPoint = {
  x: number;
  y: number;
};

export type OcrLayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrLayoutAtom = {
  id: string;
  text: string;
  lineId: string;
  order: number;
  direction: "horizontal" | "vertical";
  confidence: number;
  bboxNorm: OcrLayoutBox;
  polygonNorm: OcrLayoutPoint[];
};

export type OcrLayoutLine = {
  id: string;
  text: string;
  order: number;
  direction: "horizontal" | "vertical";
  confidence: number;
  bboxNorm: OcrLayoutBox;
  polygonNorm: OcrLayoutPoint[];
  atomIds: string[];
};

export type OcrPageLayoutResponse = {
  status: "ready";
  cacheHit: boolean;
  contentHash: string;
  ocrProfile: string;
  pageIndex: number;
  image: {
    width: number;
    height: number;
  };
  lines: OcrLayoutLine[];
  atoms: OcrLayoutAtom[];
};

export interface OcrBackendPort {
  processPdf(file: File, onProgress?: OcrProgressCallback, opts?: { signal?: AbortSignal }): Promise<File>;
  processPageLayout(args: {
    image: Blob;
    pageIndex: number;
    contentHash?: string;
    documentId?: string;
    documentVersion?: string;
    ocrProfile?: string;
    signal?: AbortSignal;
  }): Promise<OcrPageLayoutResponse>;
}

export interface AdminBackendPort {
  listOpenAiKeys(opts?: { signal?: AbortSignal }): Promise<{ keys: string[] } | null>;
  addOpenAiKey(args: { key: string }, opts?: { signal?: AbortSignal }): Promise<void>;
  removeOpenAiKey(args: { key: string }, opts?: { signal?: AbortSignal }): Promise<void>;
  searchKanji(args: { query: string }, opts?: { signal?: AbortSignal }): Promise<{ results: any[] }>;
  updateKanjiJlpt(
    args: { kanji: string; jlpt_level: number | null },
    opts?: { signal?: AbortSignal }
  ): Promise<{ kanji: string; old_jlpt: number | null; new_jlpt: number | null }>;
}

export interface VocabularyBackendPort {
  // Keep it loose for now; the feature layer already defines types.
  fetchDueCards(request?: any, opts?: { signal?: AbortSignal }): Promise<any[]>;
  fetchUserDecks(request?: any, opts?: { signal?: AbortSignal }): Promise<any[]>;
  listDeckVocabulary(deckId: string | number, opts?: { signal?: AbortSignal }): Promise<any[]>;
  lookupVocabulary(pairs: any[], fields?: string[], opts?: { signal?: AbortSignal }): Promise<any[]>;
  getJpdbData(request: any, opts?: { signal?: AbortSignal }): Promise<any[]>;
  mineJpdbWord(request: any, opts?: { signal?: AbortSignal }): Promise<any>;
  updateJpdbWordState(request: any, opts?: { signal?: AbortSignal }): Promise<any>;
  reviewJpdbCard(request: any, opts?: { signal?: AbortSignal }): Promise<any>;
  getUserVocabulary(filters?: any, opts?: { signal?: AbortSignal }): Promise<any[]>;
  addVocabularyWord(request: any, opts?: { signal?: AbortSignal }): Promise<any>;
  toggleMastered(wordId: string, mastered: boolean, opts?: { signal?: AbortSignal }): Promise<any>;
}

export type MixBackendPort = MixRefineBackendPort;

export type MixRefineResponse = { choices: RefineChoices };

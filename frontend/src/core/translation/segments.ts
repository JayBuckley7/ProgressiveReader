export const SEGMENT_TRANSLATION_PROMPT_VERSION = "segment-v1";

export type TranslateSegmentInput = {
  id: string;
  html: string;
  sourceHash?: string;
};

export type TranslateSegmentsRequest = {
  segments: TranslateSegmentInput[];
  targetLanguage: string;
  model?: string | null;
  useCefr?: boolean | null;
  cefrLevel?: string | null;
  promptVersion?: string | null;
};

export type TranslateSegmentResult = {
  id: string;
  translatedHtml: string;
  sourceHash?: string;
  modelUsed?: string;
};

export type TranslateSegmentsResponse = {
  segments: TranslateSegmentResult[];
  modelUsed?: string;
};

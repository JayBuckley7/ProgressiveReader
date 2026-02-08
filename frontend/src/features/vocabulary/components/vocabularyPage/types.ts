import type { JpdbLookupVocabularyEntry, JpdbVocabPair } from "@features/vocabulary/services/vocabApi";

export type FilterMastered = "all" | "mastered" | "learning";

export type VocabularyStats = {
  total: number;
  mastered: number;
  learning: number;
};

export type DeckVocabCache = {
  deckName: string;
  pairs: JpdbVocabPair[];
  entries: JpdbLookupVocabularyEntry[];
};

export type DueVocabProgress = {
  phase: "scan" | "details";
  loaded: number;
  total: number;
};

export interface VocabularyWord {
  _id: string;
  word: string;
  translation: string;
  language: string;
  bookId?: string;
  context?: string;
  difficulty?: "easy" | "medium" | "hard";
  mastered: boolean;
  _creationTime: number;
}


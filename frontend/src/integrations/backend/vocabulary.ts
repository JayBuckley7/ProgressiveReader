import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { VocabularyBackendPort } from "@core/backend/ports";
import type {
  AddVocabularyWordRequest,
  AddVocabularyWordResponse,
  Deck,
  DueCard,
  FetchDueCardsRequest,
  GetJpdbDataRequest,
  ListUserDecksRequest,
  MineWordRequest,
  ProcessedToken,
  ReviewCardRequest,
  UpdateWordStateRequest,
} from "~/types/api";

const getJpdbApiKeyFromCookies = (): string | undefined => {
  if (typeof document === "undefined") return undefined;
  const m1 = document.cookie.match(/(?:^|;\s*)jpdbApiKey=([^;]+)/);
  const m2 = document.cookie.match(/(?:^|;\s*)jpdb_api_key=([^;]+)/);
  const key = (m1?.[1] || m2?.[1] || "").trim();
  return key || undefined;
};

export type JpdbVocabPair = [vid: number, sid: number];

export interface JpdbLookupVocabularyEntry {
  vid: number;
  sid: number;
  spelling?: string;
  reading?: string;
  frequency_rank?: number;
  meanings?: string[];
  due_at?: number | null;
  card_state?: unknown;
  [key: string]: unknown;
}

export interface VocabularyWord {
  id: string;
  word: string;
  translation: string;
  language: string;
  bookId?: string | null;
  context?: string | null;
  difficulty?: string | null;
  mastered: boolean;
  createdAt?: string | null;
}

export function createVocabularyBackendPort(fetchPort: BackendFetchPort): VocabularyBackendPort {
  return {
    async fetchDueCards(request: FetchDueCardsRequest = {}, opts?: { signal?: AbortSignal }): Promise<DueCard[]> {
      return await fetchPort.requestJson<DueCard[]>({
        path: "/api/due-cards",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },

    async fetchUserDecks(request: ListUserDecksRequest = {}, opts?: { signal?: AbortSignal }): Promise<Deck[]> {
      const jpdbApiKey = getJpdbApiKeyFromCookies();
      const decks = await fetchPort.requestJson<Deck[]>({
        path: "/api/list-user-decks",
        method: "POST",
        body: { ...request, jpdbApiKey },
        signal: opts?.signal,
      });
      return decks.map((deck) => ({ ...deck, words: (deck as any).words ?? null }));
    },

    async listDeckVocabulary(deckId: string | number, opts?: { signal?: AbortSignal }): Promise<JpdbVocabPair[]> {
      const jpdbApiKey = getJpdbApiKeyFromCookies();
      const payload = await fetchPort.requestJson<{ vocabulary: JpdbVocabPair[] }>({
        path: "/api/jpdb/deck/list-vocabulary",
        method: "POST",
        body: { id: deckId, jpdbApiKey },
        signal: opts?.signal,
      });
      return Array.isArray((payload as any)?.vocabulary) ? (payload as any).vocabulary : [];
    },

    async lookupVocabulary(
      pairs: JpdbVocabPair[],
      fields: string[] = ["spelling", "reading", "frequency_rank", "meanings"],
      opts?: { signal?: AbortSignal }
    ): Promise<JpdbLookupVocabularyEntry[]> {
      const jpdbApiKey = getJpdbApiKeyFromCookies();
      const payload = await fetchPort.requestJson<{ vocabulary_info: any[] }>({
        path: "/api/jpdb/lookup-vocabulary",
        method: "POST",
        body: { list: pairs, fields, jpdbApiKey },
        signal: opts?.signal,
      });
      const infoRows = Array.isArray((payload as any)?.vocabulary_info) ? (payload as any).vocabulary_info : [];

      return pairs.map((pair, idx) => {
        const row = infoRows[idx];
        const entry: JpdbLookupVocabularyEntry = { vid: pair[0], sid: pair[1] };
        if (Array.isArray(row)) {
          fields.forEach((field, fieldIndex) => {
            (entry as any)[field] = row[fieldIndex];
          });
        }
        return entry;
      });
    },

    async getJpdbData(request: GetJpdbDataRequest, opts?: { signal?: AbortSignal }): Promise<ProcessedToken[]> {
      return await fetchPort.requestJson<ProcessedToken[]>({
        path: "/api/get-jpdb-data",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },

    async mineJpdbWord(request: MineWordRequest, opts?: { signal?: AbortSignal }): Promise<any> {
      return await fetchPort.requestJson<any>({
        path: "/api/mine-jpdb-word",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },

    async updateJpdbWordState(request: UpdateWordStateRequest, opts?: { signal?: AbortSignal }): Promise<any> {
      return await fetchPort.requestJson<any>({
        path: "/api/update-jpdb-word-state",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },

    async reviewJpdbCard(request: ReviewCardRequest, opts?: { signal?: AbortSignal }): Promise<any> {
      return await fetchPort.requestJson<any>({
        path: "/api/review-jpdb-card",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },

    async getUserVocabulary(filters?: { language?: string; mastered?: boolean; bookId?: string }, opts?: { signal?: AbortSignal }): Promise<VocabularyWord[]> {
      const params = new URLSearchParams();
      if (filters?.language) params.append("language", filters.language);
      if (filters?.mastered !== undefined) params.append("mastered", String(filters.mastered));
      if (filters?.bookId) params.append("bookId", filters.bookId);
      const url = `/api/vocabulary${params.toString() ? `?${params.toString()}` : ""}`;

      const res = await fetchPort.request({ path: url, method: "GET", signal: opts?.signal });
      if (!res.ok) {
        const message = await res.text().catch(() => "");
        throw new Error(message || `HTTP ${res.status}`);
      }
      return (await res.json()) as VocabularyWord[];
    },

    async addVocabularyWord(request: AddVocabularyWordRequest, opts?: { signal?: AbortSignal }): Promise<AddVocabularyWordResponse> {
      return await fetchPort.requestJson<AddVocabularyWordResponse>({
        path: "/api/vocabulary",
        method: "POST",
        body: request,
        signal: opts?.signal,
      });
    },

    async toggleMastered(wordId: string, mastered: boolean, opts?: { signal?: AbortSignal }): Promise<VocabularyWord> {
      return await fetchPort.requestJson<VocabularyWord>({
        path: `/api/vocabulary/${wordId}/mastered`,
        method: "PATCH",
        body: { mastered },
        signal: opts?.signal,
      });
    },
  };
}

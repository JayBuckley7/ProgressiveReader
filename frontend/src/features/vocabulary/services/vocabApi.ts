import { getAuthHeaders } from '@shared/utils/auth';
import type { 
  DueCard, 
  FetchDueCardsRequest, 
  Deck, 
  ListUserDecksRequest, 
  ListUserDecksResponse,
  GetJpdbDataRequest,
  ProcessedToken,
  MineWordRequest,
  UpdateWordStateRequest,
  ReviewCardRequest,
} from '~/types/api';

export async function fetchDueCards(request: FetchDueCardsRequest = {}): Promise<DueCard[]> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/due_cards', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<DueCard[]>;
}

export async function fetchUserDecks(request: ListUserDecksRequest = {}): Promise<ListUserDecksResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/list-user-decks', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `HTTP ${response.status}`);
  }
  const decks = (await response.json()) as ListUserDecksResponse;
  return decks.map((deck) => ({ ...deck, words: deck.words ?? null }));
}

export async function getJpdbData(request: GetJpdbDataRequest): Promise<ProcessedToken[]> {
  const response = await fetch('/api/get_jpdb_data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || `JPDB API Error: ${response.status}`;
    } catch (e) {
      errorMessage = `JPDB API Error: ${response.status}. Response: ${errorText}`;
    }
    throw new Error(errorMessage);
  }
  const tokens = await response.json() as ProcessedToken[];
  if (tokens && (tokens as any).error) {
    throw new Error((tokens as any).error);
  }
  if (!tokens || !Array.isArray(tokens)) {
    throw new Error("Invalid token data.");
  }
  return tokens;
}

export async function mineJpdbWord(request: MineWordRequest): Promise<{ success: boolean }> {
  const response = await fetch('/api/mine_jpdb_word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `JPDB Mining Error: ${response.status}`);
  }
  return response.json() as Promise<{ success: boolean }>;
}

export async function updateJpdbWordState(request: UpdateWordStateRequest): Promise<{ success: boolean; newState?: string[] }> {
  const response = await fetch('/api/update_jpdb_word_state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `JPDB State Update Error: ${response.status}`);
  }
  return response.json() as Promise<{ success: boolean; newState?: string[] }>;
}

export async function reviewJpdbCard(request: ReviewCardRequest): Promise<{ success: boolean; newState?: string[] }> {
  const response = await fetch('/api/review_jpdb_card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `JPDB Review Error: ${response.status}`);
  }
  return response.json() as Promise<{ success: boolean; newState?: string[] }>;
}

export async function addVocabularyWord(data: {
  word: string;
  translation: string;
  language: string;
  bookId?: string;
  context?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}): Promise<{ success: boolean; id?: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/vocabulary', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<{ success: boolean; id?: string }>;
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

export async function getUserVocabulary(filters?: {
  language?: string;
  mastered?: boolean;
  bookId?: string;
}): Promise<VocabularyWord[]> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();
  if (filters?.language) params.append('language', filters.language);
  if (filters?.mastered !== undefined) params.append('mastered', String(filters.mastered));
  if (filters?.bookId) params.append('bookId', filters.bookId);
  
  const url = `/api/vocabulary${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { ...headers },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<VocabularyWord[]>;
}

export async function toggleMastered(wordId: string, mastered: boolean): Promise<VocabularyWord> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/vocabulary/${wordId}/mastered`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mastered }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<VocabularyWord>;
}

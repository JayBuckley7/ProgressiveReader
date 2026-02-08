import { getAuthHeaders } from "@shared/utils/auth";

export interface OpenAIKeysResponse {
  keys: string[];
}

export interface KanjiInfo {
  kanji: string;
  meanings: string[];
  kun_readings: string[];
  on_readings: string[];
  jlpt?: number;
  stroke_count?: number;
  grade?: number;
}

export interface KanjiSearchResponse {
  results: KanjiInfo[];
}

export interface KanjiUpdateResponse {
  kanji: string;
  old_jlpt: number | null;
  new_jlpt: number | null;
}

async function handleJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listOpenAiKeys(): Promise<OpenAIKeysResponse | null> {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/openai_keys", { headers });
  if (response.status === 403) return null;
  return handleJson<OpenAIKeysResponse>(response);
}

export async function addOpenAiKey(key: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/openai_keys/add", {
    method: "POST",
    headers,
    body: JSON.stringify({ key }),
  });
  await handleJson<unknown>(response);
}

export async function removeOpenAiKey(key: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/openai_keys/remove", {
    method: "POST",
    headers,
    body: JSON.stringify({ key }),
  });
  await handleJson<unknown>(response);
}

export async function searchKanji(query: string): Promise<KanjiSearchResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/kanji/search", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return handleJson<KanjiSearchResponse>(response);
}

export async function updateKanjiJlpt(kanji: string, jlpt_level: number | null): Promise<KanjiUpdateResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch("/api/kanji/update", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ kanji, jlpt_level }),
  });
  return handleJson<KanjiUpdateResponse>(response);
}


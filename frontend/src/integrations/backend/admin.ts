import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { AdminBackendPort } from "@core/backend/ports";

export function createAdminBackendPort(fetchPort: BackendFetchPort): AdminBackendPort {
  return {
    async listOpenAiKeys(opts?: { signal?: AbortSignal }): Promise<{ keys: string[] } | null> {
      const res = await fetchPort.request({ path: "/api/openai-keys", method: "GET", signal: opts?.signal });
      if (res.status === 403) return null;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      return (await res.json()) as { keys: string[] };
    },

    async addOpenAiKey(args: { key: string }, opts?: { signal?: AbortSignal }): Promise<void> {
      await fetchPort.requestJson<unknown>({
        path: "/api/openai-keys/add",
        method: "POST",
        body: { key: args.key },
        signal: opts?.signal,
      });
    },

    async removeOpenAiKey(args: { key: string }, opts?: { signal?: AbortSignal }): Promise<void> {
      await fetchPort.requestJson<unknown>({
        path: "/api/openai-keys/remove",
        method: "POST",
        body: { key: args.key },
        signal: opts?.signal,
      });
    },

    async searchKanji(args: { query: string }, opts?: { signal?: AbortSignal }): Promise<{ results: any[] }> {
      return await fetchPort.requestJson<{ results: any[] }>({
        path: "/api/kanji/search",
        method: "POST",
        body: { query: args.query },
        signal: opts?.signal,
      });
    },

    async updateKanjiJlpt(
      args: { kanji: string; jlpt_level: number | null },
      opts?: { signal?: AbortSignal }
    ): Promise<{ kanji: string; old_jlpt: number | null; new_jlpt: number | null }> {
      return await fetchPort.requestJson<{ kanji: string; old_jlpt: number | null; new_jlpt: number | null }>({
        path: "/api/kanji/update",
        method: "POST",
        body: { kanji: args.kanji, jlpt_level: args.jlpt_level },
        signal: opts?.signal,
      });
    },
  };
}


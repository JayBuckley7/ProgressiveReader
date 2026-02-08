import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { OpenAiKeyBackendPort } from "@core/backend/ports";

export function createOpenAiKeyBackendPort(fetchPort: BackendFetchPort): OpenAiKeyBackendPort {
  return {
    async isOpenAiKeyConfigured(opts?: { signal?: AbortSignal }): Promise<boolean> {
      const res = await fetchPort.request({ path: "/api/openai-key-configured", signal: opts?.signal });
      if (!res.ok) return false;
      try {
        const data = (await res.json()) as any;
        return Boolean(
          data?.configured ??
            data?.openai_key_configured ??
            data?.openaiKeyConfigured ??
            data?.openAiKeyConfigured
        );
      } catch {
        return false;
      }
    },
  };
}

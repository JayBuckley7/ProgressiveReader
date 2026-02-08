import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { TranslationBackendPort } from "@core/backend/ports";
import type { TranslateRequest, TranslateResponse } from "~/types/api";

export function createTranslationBackendPort(fetchPort: BackendFetchPort): TranslationBackendPort {
  return {
    async translateChapter(req: TranslateRequest, opts?: { signal?: AbortSignal }): Promise<TranslateResponse> {
      return await fetchPort.requestJson<TranslateResponse>({
        path: "/api/translate/chapter",
        method: "POST",
        body: { ...req, stream: false },
        signal: opts?.signal,
      });
    },

    async *translateChapterStream(
      req: TranslateRequest,
      onChunk?: (chunk: string) => void,
      onComplete?: (complete: string) => void,
      opts?: { signal?: AbortSignal }
    ): AsyncGenerator<string, void, unknown> {
      const res = await fetchPort.request({
        path: "/api/translate/chapter",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ ...req, stream: true }),
        signal: opts?.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("Response body is null");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";
      let totalBytes = 0;
      let readCount = 0;

      // Safety valves: prevents runaway memory if the stream never terminates.
      const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // 8MB of streamed payload
      const MAX_READ_COUNT = 20_000;

      try {
        while (true) {
          readCount += 1;
          if (readCount > MAX_READ_COUNT) {
            await reader.cancel().catch(() => {});
            throw new Error("Translation stream exceeded maximum read iterations");
          }

          const { value, done } = await reader.read();
          if (done) break;

          if (value) {
            totalBytes += value.byteLength;
            if (totalBytes > MAX_TOTAL_BYTES) {
              await reader.cancel().catch(() => {});
              throw new Error("Translation stream exceeded maximum size");
            }
            buffer += decoder.decode(value, { stream: true });
          }

          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() || "";

          for (const part of parts) {
            const lines = part.split(/\r?\n/);
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;

              const data = line.slice(5).trimStart();
              if (data === "[DONE]") {
                onComplete?.(accumulated);
                await reader.cancel().catch(() => {});
                return;
              }

              try {
                const parsed = JSON.parse(data);

                // Some mocks may JSON-encode the sentinel.
                if (parsed === "[DONE]") {
                  onComplete?.(accumulated);
                  await reader.cancel().catch(() => {});
                  return;
                }

                if (parsed?.content) {
                  accumulated += parsed.content;
                  yield parsed.content;
                  onChunk?.(parsed.content);
                }

                if (parsed?.complete) {
                  onComplete?.(parsed.translated_text || accumulated);
                  await reader.cancel().catch(() => {});
                  return;
                }
              } catch {
                // Ignore parse errors for malformed SSE chunks
              }
            }
          }
        }

        // Handle any remaining buffer
        if (buffer) {
          const lines = buffer.split(/\r?\n/);
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trimStart();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed?.content) {
                accumulated += parsed.content;
                yield parsed.content;
                onChunk?.(parsed.content);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        onComplete?.(accumulated);
      } finally {
        reader.releaseLock();
      }
    },
  };
}


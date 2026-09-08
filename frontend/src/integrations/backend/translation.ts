import { backendResponseError } from "@core/backend/errors";
import type { BackendFetchPort } from "@core/backend/fetchPort";
import type { TranslationBackendPort } from "@core/backend/ports";
import {
  SEGMENT_TRANSLATION_PROMPT_VERSION,
  type TranslateSegmentInput,
  type TranslateSegmentResult,
  type TranslateSegmentsRequest,
  type TranslateSegmentsResponse,
} from "@core/translation/segments";
import type { TranslateRequest, TranslateResponse } from "~/types/api";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeSegmentResult(value: unknown): TranslateSegmentResult {
  const candidate = value as Record<string, unknown> | null;
  const id = optionalString(candidate?.id)?.trim();
  const translatedHtml = optionalString(candidate?.translatedHtml ?? candidate?.translated_html);
  if (!id || !translatedHtml) {
    throw new Error("Invalid segmented translation response");
  }

  const sourceHash = optionalString(candidate?.sourceHash ?? candidate?.source_hash)?.trim();
  const modelUsed = optionalString(candidate?.modelUsed ?? candidate?.model_used)?.trim();
  return {
    id,
    translatedHtml,
    ...(sourceHash ? { sourceHash } : {}),
    ...(modelUsed ? { modelUsed } : {}),
  };
}

function normalizeSegmentsRequest(request: TranslateSegmentsRequest): TranslateSegmentsRequest {
  if (!Array.isArray(request.segments) || request.segments.length === 0) {
    throw new TypeError("Segment translation request must include at least one segment");
  }

  const segments: TranslateSegmentInput[] = request.segments.map((segment) => {
    const id = String(segment.id || "").trim();
    if (!id) throw new TypeError("Segment translation request ids must be non-empty");
    if (typeof segment.html !== "string" || !segment.html.trim()) {
      throw new TypeError(`Segment translation source HTML must be non-empty for ${id}`);
    }
    const sourceHash = segment.sourceHash?.trim();
    return {
      id,
      html: segment.html,
      ...(sourceHash ? { sourceHash } : {}),
    };
  });
  if (new Set(segments.map((segment) => segment.id)).size !== segments.length) {
    throw new TypeError("Segment translation request ids must be unique");
  }

  const targetLanguage = String(request.targetLanguage || "").trim();
  if (!targetLanguage) throw new TypeError("targetLanguage must be non-empty");
  return {
    ...request,
    segments,
    targetLanguage,
    promptVersion: request.promptVersion?.trim() || SEGMENT_TRANSLATION_PROMPT_VERSION,
  };
}

function normalizeSegmentsResponse(
  value: unknown,
  request: TranslateSegmentsRequest
): TranslateSegmentsResponse {
  const candidate = value as Record<string, unknown> | null;
  if (!Array.isArray(candidate?.segments)) {
    throw new Error("Invalid segmented translation response");
  }
  const requestedIds = request.segments.map((segment) => segment.id);
  const requestedIdSet = new Set(requestedIds);

  const normalizedSegments = candidate.segments.map(normalizeSegmentResult);
  const resultById = new Map(normalizedSegments.map((segment) => [segment.id, segment]));
  if (
    resultById.size !== normalizedSegments.length ||
    normalizedSegments.some((segment) => !requestedIdSet.has(segment.id))
  ) {
    throw new Error("Segmented translation response did not match the request ids");
  }

  const modelUsed = optionalString(candidate?.modelUsed ?? candidate?.model_used)?.trim();
  const orderedSegments = request.segments.flatMap((requested) => {
    const result = resultById.get(requested.id);
    if (!result) return [];
    if (requested.sourceHash && result.sourceHash && requested.sourceHash !== result.sourceHash) {
      throw new Error(`Segmented translation response source hash mismatch for ${requested.id}`);
    }
    return [result.modelUsed || !modelUsed ? result : { ...result, modelUsed }];
  });
  return {
    segments: orderedSegments,
    ...(modelUsed ? { modelUsed } : {}),
  };
}

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

    async translateSegments(
      req: TranslateSegmentsRequest,
      opts?: { signal?: AbortSignal }
    ): Promise<TranslateSegmentsResponse> {
      const normalizedRequest = normalizeSegmentsRequest(req);
      const response = await fetchPort.requestJson<unknown>({
        path: "/api/translate/segments",
        method: "POST",
        body: normalizedRequest,
        signal: opts?.signal,
      });
      return normalizeSegmentsResponse(response, normalizedRequest);
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

      if (!res.ok) throw await backendResponseError(res);

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


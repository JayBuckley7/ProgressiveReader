import { describe, expect, it, vi } from "vitest";

import type { BackendFetchPort } from "@core/backend/fetchPort";
import { createTranslationBackendPort } from "@integrations/backend/translation";

describe("translation backend segmented adapter", () => {
  it("posts the agreed request and normalizes snake-case response fields", async () => {
    const requestJson = vi.fn(async () => ({
      segments: [
        {
          id: "segment-1",
          translated_html: "<p>Translated</p>",
          source_hash: "sha256:abc",
          model_used: "gpt-test-2026",
        },
      ],
      model_used: "gpt-test-2026",
    }));
    const fetchPort = {
      request: vi.fn(),
      requestJson,
    } as unknown as BackendFetchPort;
    const backend = createTranslationBackendPort(fetchPort);
    const controller = new AbortController();
    const request = {
      segments: [{ id: "segment-1", html: "<p>Source</p>", sourceHash: "sha256:abc" }],
      targetLanguage: "English",
      model: "gpt-test",
      useCefr: true,
      cefrLevel: "B2",
      promptVersion: "segment-v1",
    };

    await expect(backend.translateSegments(request, { signal: controller.signal })).resolves.toEqual({
      segments: [
        {
          id: "segment-1",
          translatedHtml: "<p>Translated</p>",
          sourceHash: "sha256:abc",
          modelUsed: "gpt-test-2026",
        },
      ],
      modelUsed: "gpt-test-2026",
    });
    expect(requestJson).toHaveBeenCalledWith({
      path: "/api/translate/segments",
      method: "POST",
      body: request,
      signal: controller.signal,
    });
  });

  it("retains the chapter request path", async () => {
    const requestJson = vi.fn(async () => ({ translatedText: "<p>Chapter</p>" }));
    const backend = createTranslationBackendPort({
      request: vi.fn(),
      requestJson,
    } as unknown as BackendFetchPort);

    await backend.translateChapter({ content: "<p>Source</p>", targetLang: "English" });
    expect(requestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/translate/chapter",
        method: "POST",
        body: expect.objectContaining({ content: "<p>Source</p>", stream: false }),
      })
    );
  });

  it("accepts a trustworthy partial response so missing segments can be retried", async () => {
    const requestJson = vi.fn(async () => ({
      segments: [{ id: "expected-a", translatedHtml: "<p>Paid result</p>", sourceHash: "hash-a" }],
      modelUsed: "gpt-test",
    }));
    const backend = createTranslationBackendPort({
      request: vi.fn(),
      requestJson,
    } as unknown as BackendFetchPort);

    await expect(
      backend.translateSegments({
        segments: [
          { id: "expected-a", html: "<p>Source A</p>", sourceHash: "hash-a" },
          { id: "expected-b", html: "<p>Source B</p>", sourceHash: "hash-b" },
        ],
        targetLanguage: "English",
      })
    ).resolves.toEqual({
      segments: [{
        id: "expected-a",
        translatedHtml: "<p>Paid result</p>",
        sourceHash: "hash-a",
        modelUsed: "gpt-test",
      }],
      modelUsed: "gpt-test",
    });
  });

  it("rejects unrequested or mismatched segment ids", async () => {
    const requestJson = vi.fn(async () => ({
      segments: [{ id: "wrong", translatedHtml: "<p>Wrong</p>" }],
    }));
    const backend = createTranslationBackendPort({
      request: vi.fn(),
      requestJson,
    } as unknown as BackendFetchPort);

    await expect(
      backend.translateSegments({
        segments: [{ id: "expected", html: "<p>Source</p>" }],
        targetLanguage: "English",
      })
    ).rejects.toThrow("did not match the request ids");
    expect(requestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ promptVersion: "segment-v1" }),
      })
    );
  });
});

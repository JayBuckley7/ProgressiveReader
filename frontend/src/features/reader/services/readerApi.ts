import type { TranslateRequest, TranslateResponse } from '~/types/api';

export async function translateChapter(req: TranslateRequest): Promise<TranslateResponse> {
  const res = await fetch('/api/translate/chapter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, stream: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<TranslateResponse>;
}

export async function* translateChapterStream(
  req: TranslateRequest,
  onChunk?: (chunk: string) => void,
  onComplete?: (complete: string) => void
): AsyncGenerator<string, void, unknown> {
  const res = await fetch('/api/translate/chapter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...req, stream: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (!res.body) {
    throw new Error('Response body is null');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (part.startsWith('data: ')) {
          const data = part.slice(6);
          if (data === '[DONE]') {
            if (onComplete) {
              onComplete(accumulated);
            }
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              accumulated += parsed.content;
              yield parsed.content;
              if (onChunk) {
                onChunk(parsed.content);
              }
            }
            if (parsed.complete && parsed.translated_text) {
              if (onComplete) {
                onComplete(parsed.translated_text);
              }
            }
          } catch (e) {
            // Ignore parse errors for malformed SSE chunks
          }
        }
      }
    }

    // Handle any remaining buffer
    if (buffer) {
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            accumulated += parsed.content;
            yield parsed.content;
            if (onChunk) {
              onChunk(parsed.content);
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    if (onComplete) {
      onComplete(accumulated);
    }
  } finally {
    reader.releaseLock();
  }
}



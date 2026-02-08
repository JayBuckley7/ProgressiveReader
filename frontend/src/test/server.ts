import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Utility: create a minimal SSE stream response
function sseResponse(events: Array<Record<string, any>>): HttpResponse {
  const body = events.map((ev) => `data: ${JSON.stringify(ev)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new HttpResponse(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// Use the standard Response shape for JSON mocks; this plays nicer with happy-dom fetch.
function jsonResponse(body: any, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...(init || {}),
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export const server = setupServer(
  // Translation domain routes
  // Reader: chapter translation SSE
  http.post('/api/translate/chapter', async () => {
    return sseResponse([
      { status: 'started' },
      { content: '<p>Mock Translation</p>' },
      { complete: true, translated_text: '<div>Mock Translation</div>' },
    ]);
  }),

  // Translation: vocabulary translation
  http.post('/api/translate/vocabulary', async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return jsonResponse({
      translated_text: `Mock translation of "${body.content || ''}"`,
      model_used: body.model || 'gpt-4o-mini',
    });
  }),

  // Mix mode: refine ambiguous swaps
  http.post('/api/mix/refine', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as any;
    const keys = Array.isArray(body?.ambiguousKeys) ? (body.ambiguousKeys as string[]) : [];
    const choices = Object.fromEntries(keys.map((k) => [k, null]));
    return jsonResponse({ choices, model_used: body?.model || 'gpt-4o-mini' });
  }),

  // Bookmarks
  http.get('/api/bookmarks', () => jsonResponse([])),
  http.post('/api/bookmarks', async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return jsonResponse({ id: 'b1', ...body, createdAt: new Date().toISOString() });
  }),

  // Vocabulary domain routes
  // Vocabulary: list user vocabulary
  http.get('/api/vocabulary', async () => jsonResponse([])),

  // Vocabulary due cards
  http.post('/api/due_cards', async () => {
    return jsonResponse([
      { id: '1', term: '誰', meaning: 'who' },
      { id: '2', term: '水', meaning: 'water' },
    ]);
  }),

  // Vocabulary: list user decks
  http.post('/api/list-user-decks', async () => {
    return jsonResponse([
      { id: '1', name: 'My Deck', words: 100 },
      { id: '2', name: 'Another Deck', words: 50 },
    ]);
  }),

  // JPDB: deck vocabulary list (pairs)
  http.post('/api/jpdb/deck/list-vocabulary', async () => {
    return jsonResponse({ vocabulary: [[1, 1], [2, 2]] });
  }),

  // JPDB: lookup vocabulary details
  http.post('/api/jpdb/lookup-vocabulary', async ({ request }) => {
    const body = await request.json().catch(() => ({} as any));
    const list = Array.isArray((body as any).list) ? (body as any).list : [];
    const fields = Array.isArray((body as any).fields) ? (body as any).fields : [];
    const now = Date.now();

    const byKey: Record<string, any> = {
      '1/1': { spelling: '誰', reading: 'だれ', meanings: ['who'], due_at: now - 1000, card_state: ['due'] },
      '2/2': { spelling: '水', reading: 'みず', meanings: ['water'], due_at: now - 1000, card_state: ['due'] },
    };

    const vocabulary_info = list.map((pair: any) => {
      const key = `${pair?.[0]}/${pair?.[1]}`;
      const entry = byKey[key] || {};
      return fields.map((field: string) => (entry as any)[field] ?? null);
    });

    return jsonResponse({ vocabulary_info });
  }),

  // Vocabulary: add word (now with schema validation)
  http.post('/api/vocabulary', async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return jsonResponse({
      success: true,
      id: 'v1',
      word: body.word || '',
      translation: body.translation || '',
      language: body.language || 'English',
    });
  }),

  // JPDB endpoints
  http.post('/api/get_jpdb_data', async () => {
    return jsonResponse([
      {
        start: 0,
        length: 5,
        end: 5,
        card: { vid: 1, sid: 1, rid: 1, state: ['new'], spelling: 'テスト', reading: 'てすと', frequencyRank: 100, pitchAccent: [], meanings: [] },
        rubies: [],
      },
    ]);
  }),
  http.post('/api/mine_jpdb_word', async () => jsonResponse({ success: true })),
  http.post('/api/update_jpdb_word_state', async () => jsonResponse({ success: true, newState: ['known'] })),
  http.post('/api/review_jpdb_card', async () => jsonResponse({ success: true, newState: ['known'] })),

  // Admin: OpenAI keys
  http.get('/api/openai_key_configured', async () => jsonResponse({ openai_key_configured: true, pool_size: 1 })),
  http.get('/api/openai_keys', async () => jsonResponse({ keys: [] })),
  http.post('/api/openai_keys/add', async () => jsonResponse({ success: true, pool_size: 1 })),
  http.post('/api/openai_keys/remove', async () => jsonResponse({ success: true, pool_size: 0 })),

  // Kanji domain routes
  http.post('/api/kanji/search', async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return jsonResponse({
      results: [
        {
          kanji: body.query || '漢',
          meanings: ['kanji', 'character'],
          jlpt: 2,
        },
      ],
    });
  }),
  http.post('/api/kanji/update', async ({ request }) => {
    const body = await request.json().catch(() => ({}));
    return jsonResponse({
      success: true,
      kanji: body.kanji || '漢',
      old_jlpt: 2,
      new_jlpt: body.jlpt_level || 1,
    });
  }),
  http.get('/api/kanji/info/:kanji_char', async ({ params }) => {
    return jsonResponse({
      kanji: params.kanji_char || '漢',
      meanings: ['kanji', 'character'],
      jlpt: 2,
    });
  }),
);

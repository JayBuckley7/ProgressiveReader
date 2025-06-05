export interface DemoBook {
  id: string;
  filename: string;
  title: string;
  coverImage: string;
}

export const DEMO_BOOKS: DemoBook[] = [
  {
    id: 'demo-uuid-dcc-smol',
    filename: 'dcc_smol.epub',
    title: 'Dungeon Crawler Carl – 01',
    coverImage: '/static/demo_books/covers/dcc_cover.jpg'
  },
  {
    id: 'demo-uuid-wasteland-smol',
    filename: 'wasteland_smol.epub',
    title: 'The Waste Land',
    coverImage: '/static/demo_books/covers/wasteland_cover.jpg'
  },
  {
    id: 'demo-uuid-kusamakura-smol',
    filename: '草枕_smol.epub',
    title: 'Kusamakura (草枕)',
    coverImage: '/static/demo_books/covers/kusamakura_cover.jpg'
  }
];

import type { BookMetadata } from './services/storageService';

export function getDemoBooks(): BookMetadata[] {
  return DEMO_BOOKS.map((b) => ({
    id: b.id,
    title: b.title,
    fileType: 'epub',
    coverUrl: b.coverImage,
    uploadedAt: new Date(),
    userId: 'demo',
    cloudProvider: 'local'
  }));
}

export async function getDemoBookFile(bookId: string): Promise<Blob | null> {
  const book = DEMO_BOOKS.find((b) => b.id === bookId);
  if (!book) return null;
  const resp = await fetch(`/static/demo_books/${book.filename}`);
  if (!resp.ok) return null;
  return await resp.blob();
}

function setupFetchMocks() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/api/translate')) {
      try {
        const body = init && init.body ? JSON.parse(init.body as string) : {};
        const bookId = body.book_id || body.bookId;
        const itemIndex = body.item_index ?? 0;
        const targetLanguage = body.target_language || 'English';
        const dataRes = await originalFetch(
          `/static/demo_data/${bookId}/translate_responses.json`
        );
        if (dataRes.ok) {
          const all = await dataRes.json();
          const entry = all.find(
            (e: any) =>
              e.item_index === itemIndex && e.target_language === targetLanguage
          );
          if (entry && entry.response_json) {
            return new Response(JSON.stringify(entry.response_json), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
      } catch (e) {
        console.warn('Demo translate mock failed', e);
      }
    }

    if (url.endsWith('/api/get_jpdb_data')) {
      try {
        const body = init && init.body ? JSON.parse(init.body as string) : {};
        const bookId = body.book_id || body.bookId;
        const dataRes = await originalFetch(
          `/static/demo_data/${bookId}/highlight_responses.json`
        );
        if (dataRes.ok) {
          const all = await dataRes.json();
          const entry = all.find((e: any) => e.item_index === body.item_index);
          if (entry && entry.response_json) {
            return new Response(JSON.stringify(entry.response_json), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
      } catch (e) {
        console.warn('Demo jpdb mock failed', e);
      }
    }

    return originalFetch(input, init);
  };
}

export function initDemoMode() {
  (window as any).IS_DEMO_MODE = true;
  setupFetchMocks();
  document.cookie = 'jpdbApiKey=demo_mode_key;path=/';
}


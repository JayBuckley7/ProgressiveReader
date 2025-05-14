// app/static/js/demo_reader.js

// Ensure this script knows it's in demo mode for clarity, though its execution implies it.
window.IS_DEMO_MODE = true;
console.log('[DemoReader] Initializing demo mode for reader page.');

const DEMO_BOOKS = [
  {
    id:        'demo-uuid-dcc-smol',
    filename:  'dcc_smol.epub',
    title:     'Dungeon Crawler Carl – 01',
    coverImage:'/static/demo_books/covers/dcc_cover.jpg', // fallback
  },
  {
    id:        'demo-uuid-wasteland-smol',
    filename:  'wasteland_smol.epub',
    title:     'The Waste Land',
    coverImage:'/static/demo_books/covers/wasteland_cover.jpg',
  },
  {
    id:        'demo-uuid-kusamakura-smol',
    filename:  '草枕_smol.epub',
    title:     'Kusamakura (草枕)',
    coverImage:'/static/demo_books/covers/kusamakura_cover.jpg',
  },
];

// 1. Mock API calls (fetch shim)
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;

  // ── OpenAI translation ──────────────────────────────
  if (url.endsWith('/api/translate')) {
    console.log('[DemoReader] Mocking /api/translate call.');
    return new Response(
      JSON.stringify({ translated_text: '[demo translation]' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── JPDB JLPT token data ───────────────────────────
  if (url.endsWith('/api/get_jpdb_data')) {
    console.log('[DemoReader] Mocking /api/get_jpdb_data call.');
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // For any other URL, use the real fetch
  return originalFetch(input, init);
};

window.getDemoBookFile = async function(bookId) {
  if (!window.IS_DEMO_MODE) return null;

  const demoBook = DEMO_BOOKS.find(b => b.id === bookId);
  if (demoBook) {
    console.log(`[DemoReader] Requested demo book: ${demoBook.title}`);
    try {
      const response = await fetch(`/static/demo_books/${demoBook.filename}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch demo EPUB ${demoBook.filename}: ${response.statusText}`);
      }
      const blob = await response.blob();
      return {
        id: demoBook.id,
        title: demoBook.title,
        content: blob, // This is what getBookData in reader.js expects
        filename: demoBook.filename,
        isDemo: true
      };
    } catch (error) {
      console.error(`[DemoReader] Error fetching demo book file for ${bookId}:`, error);
      return null;
    }
  }
  return null;
};

// 2. Disable UI elements specific to demo mode
document.addEventListener('DOMContentLoaded', () => {
  const translateBtn = document.getElementById('translate-btn');
  const translateCefrBtn = document.getElementById('translate-cefr-btn');

  if (translateBtn) {
    translateBtn.disabled = true;
    translateBtn.title = 'Disabled in demo';
    console.log('[DemoReader] Disabled translate button.');
  }

  if (translateCefrBtn) {
    translateCefrBtn.disabled = true;
    translateCefrBtn.title = 'Disabled in demo';
    console.log('[DemoReader] Disabled CEFR translate button.');
  }
}); 
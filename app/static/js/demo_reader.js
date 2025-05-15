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

let mockTranslateData = [];
let mockHighlightData = [];
let pageConfig = {};

// Utility to get cookie by name
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

const CEFR_LEVELS_TRANSLATION = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Function to get current page config (bookId, item_index)
function updatePageConfig() {
    const configElement = document.getElementById('page-config');
    if (configElement) {
        try {
            const newConfig = JSON.parse(configElement.textContent);
            // Check if bookId has changed to trigger mock data reload
            if (pageConfig.bookId !== newConfig.bookId) {
                console.log(`[DemoReader] Book ID changed from ${pageConfig.bookId} to ${newConfig.bookId}. Reloading mock data.`);
                pageConfig = newConfig;
                loadMockData(); // Reload data for the new book
            } else {
                pageConfig = newConfig;
            }
        } catch (e) {
            console.error('[DemoReader] Failed to parse page configuration.', e);
            pageConfig = {}; 
        }
    } else {
        console.warn('[DemoReader] Page config element not found.');
        pageConfig = {};
    }
}

// Fetch mock data
async function loadMockData() {
  if (!pageConfig.bookId) {
    console.warn('[DemoReader] Cannot load mock data: bookId not available in pageConfig.');
    mockTranslateData = [];
    mockHighlightData = [];
    return;
  }

  const bookId = pageConfig.bookId;
  console.log(`[DemoReader] Loading mock data for book: ${bookId}`);

  try {
    const translatePath = `/static/demo_data/${bookId}/translate_responses.json`;
    const translateResponse = await fetch(translatePath);
    if (translateResponse.ok) {
      mockTranslateData = await translateResponse.json();
      console.log(`[DemoReader] Loaded mock translation data for ${bookId}:`, mockTranslateData);
    } else {
      console.error(`[DemoReader] Failed to load ${translatePath}`, translateResponse.statusText);
      mockTranslateData = []; // Clear previous data on failure
    }

    const highlightPath = `/static/demo_data/${bookId}/highlight_responses.json`;
    const highlightResponse = await fetch(highlightPath);
    if (highlightResponse.ok) {
      mockHighlightData = await highlightResponse.json();
      console.log(`[DemoReader] Loaded mock highlight data for ${bookId}:`, mockHighlightData);
    } else {
      console.error(`[DemoReader] Failed to load ${highlightPath}`, highlightResponse.statusText);
      mockHighlightData = []; // Clear previous data on failure
    }
  } catch (error) {
    console.error(`[DemoReader] Error loading mock data for ${bookId}:`, error);
    mockTranslateData = [];
    mockHighlightData = [];
  }
}

// 1. Mock API calls (fetch shim)
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  updatePageConfig(); // Ensure pageConfig is fresh for each call

  // ── OpenAI translation ──────────────────────────────
  if (url.endsWith('/api/translate')) {
    const requestBody = init && init.body ? JSON.parse(init.body) : {};
    const targetLanguage = requestBody.target_language || 'Spanish';
    const itemIndex = requestBody.item_index !== undefined ? requestBody.item_index : pageConfig.currentIndex;
    // Determine initial cefrLevel based on request or default to A1 if not specified
    let cefrLevel = requestBody.cefr_level || 'A1'; 

    console.log(`[DemoReader] Mocking /api/translate for index: ${itemIndex}, lang: ${targetLanguage}, requested cefr: ${requestBody.cefr_level || 'not specified'}`);

    let effectiveCefrForDemoLookup = cefrLevel;
    if (window.IS_DEMO_MODE && cefrLevel === "ALL") {
        console.log(`[DemoReader] Translation CEFR level is "ALL" in demo mode, using "C2" for mock data lookup.`);
        effectiveCefrForDemoLookup = "C2";
    }

    let mockEntry = mockTranslateData.find(entry =>
      entry.item_index === itemIndex &&
      entry.target_language === targetLanguage &&
      entry.cefr_level === effectiveCefrForDemoLookup
    );

    // Fallback: If C2 was used (because original was ALL) and no C2 data found, try to find actual "ALL" data.
    if (!mockEntry && cefrLevel === "ALL") { 
        console.log(`[DemoReader] No mock translation data found for CEFR level ${effectiveCefrForDemoLookup} (mapped from ALL). Trying cefr_level: "ALL" mock data.`);
        mockEntry = mockTranslateData.find(entry =>
            entry.item_index === itemIndex &&
            entry.target_language === targetLanguage &&
            entry.cefr_level === "ALL"
        );
    } else if (!mockEntry) {
        console.log(`[DemoReader] No specific mock translation data found for requested/mapped CEFR level: ${effectiveCefrForDemoLookup}.`);
    }

    if (mockEntry) {
      if (mockEntry.response_json_stream && Array.isArray(mockEntry.response_json_stream)) {
        console.log('[DemoReader] Using mock translation stream entry:', mockEntry);
        const stream = new ReadableStream({
          async start(controller) {
            for (const chunk of mockEntry.response_json_stream) {
              controller.enqueue(new TextEncoder().encode(chunk));
              await new Promise(resolve => setTimeout(resolve, 50)); 
            }
            controller.close();
          }
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      } else if (mockEntry.response_json) {
        console.log('[DemoReader] Using mock translation entry (non-streamed JSON), providing as a simple stream:', mockEntry);
        const simpleStreamData = `data: ${JSON.stringify(mockEntry.response_json)}\n\ndata: [DONE]\n\n`;
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(simpleStreamData));
                controller.close();
            }
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      } else {
        // mockEntry exists but is malformed (no stream or json data property)
        console.warn('[DemoReader] Found mockEntry but it is malformed. Using generic stream response.', mockEntry);
        const genericData = { translated_text: `[Malformed Mock for index ${itemIndex}, ${targetLanguage}, ${effectiveCefrForDemoLookup}]` };
        const genericStreamData = `data: ${JSON.stringify(genericData)}\n\ndata: [DONE]\n\n`;
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(genericStreamData));
                controller.close();
            }
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
      }
    } else {
      // No mockEntry found at all (after all lookups)
      console.warn('[DemoReader] No mock translation data found at all. Using generic stream response.');
      const genericData = { translated_text: `[Generic Demo for index ${itemIndex}, ${targetLanguage}, ${effectiveCefrForDemoLookup}]` };
      const genericStreamData = `data: ${JSON.stringify(genericData)}\n\ndata: [DONE]\n\n`;
      const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(genericStreamData));
                controller.close();
            }
        });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }
  }

  // ── JPDB JLPT token data ───────────────────────────
  if (url.endsWith('/api/get_jpdb_data')) {
    const requestBody = init && init.body ? JSON.parse(init.body) : {};
    const itemIndex = requestBody.item_index !== undefined ? requestBody.item_index : pageConfig.currentIndex;
    const targetLanguage = "Japanese";
    const cefrIndexCookie = getCookie('cefr_index');
    let currentCefrLevel = "ALL";
    if (cefrIndexCookie !== null) {
      const idx = parseInt(cefrIndexCookie, 10);
      if (idx >= 0 && idx < CEFR_LEVELS_TRANSLATION.length) {
        currentCefrLevel = CEFR_LEVELS_TRANSLATION[idx];
      }
    }
    const finalCefrLevel = requestBody.cefr_level || currentCefrLevel;

    console.log(`[DemoReader] Mocking /api/get_jpdb_data for index: ${itemIndex}, lang: ${targetLanguage}, cefr: ${finalCefrLevel}`);

    let effectiveCefrForDemoLookup = finalCefrLevel;
    if (window.IS_DEMO_MODE && finalCefrLevel === "ALL") {
        console.log(`[DemoReader] CEFR level is "ALL" in demo mode, using "C2" for mock data lookup.`);
        effectiveCefrForDemoLookup = "C2";
    }

    let mockEntry = mockHighlightData.find(entry =>
      entry.item_index === itemIndex &&
      entry.target_language === targetLanguage &&
      entry.cefr_level === effectiveCefrForDemoLookup
    );

    // Fallback: If C2 was used (because original was ALL) and no C2 data found, try to find actual "ALL" data.
    // Or, if the original request was for a specific level (not ALL) and it wasn't found, this won't run.
    if (!mockEntry && finalCefrLevel === "ALL") { 
        console.log(`[DemoReader] No mock data found for CEFR level ${effectiveCefrForDemoLookup} (mapped from ALL). Trying cefr_level: "ALL" mock data.`);
        mockEntry = mockHighlightData.find(entry =>
            entry.item_index === itemIndex &&
            entry.target_language === targetLanguage &&
            entry.cefr_level === "ALL" 
        );
    } else if (!mockEntry) {
        console.log(`[DemoReader] No mock data found for originally requested/mapped CEFR level: ${effectiveCefrForDemoLookup}.`);
    }

    if (mockEntry) {
      console.log('[DemoReader] Found matching mock highlight entry:', mockEntry);
      return new Response(
        JSON.stringify(mockEntry.response_json),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      console.warn('[DemoReader] No matching mock highlight data (specific or ALL). Returning empty array.');
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
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

// Initialize mock data loading and other DOM manipulations
async function initDemoReader() {
    updatePageConfig(); // Initial page config load, which now also triggers loadMockData if bookId is new
    if (!mockTranslateData.length && !mockHighlightData.length && pageConfig.bookId) {
        // If updatePageConfig didn't load data (e.g. bookId was already set but data not loaded), load it now.
        await loadMockData();
    }

    // DOM manipulations that should happen after DOM is ready
    const translateBtn = document.getElementById('translate-btn');
    const translateCefrBtn = document.getElementById('translate-cefr-btn');

    if (translateBtn) {
        //translateBtn.disabled = true;
        //translateBtn.title = 'Disabled in demo';
        //console.log('[DemoReader] Disabled translate button.');
    }

    if (translateCefrBtn) {
        //translateCefrBtn.disabled = true;
        //translateCefrBtn.title = 'Disabled in demo';
        //console.log('[DemoReader] Disabled CEFR translate button.');
    }

    // Modify Server Key Status for demo mode in Settings Modal
    const apiKeyInput = document.getElementById('openai-key');
    const modelSelect = document.getElementById('openai-model');
    const jpdbApiKeyInput = document.getElementById('jpdb-api-key'); // Added for JLPT settings

    if (apiKeyInput) {
        apiKeyInput.disabled = true;
        apiKeyInput.title = 'Disabled in Demo Mode';
        const statusParagraph = apiKeyInput.nextElementSibling; // This should be the <p> tag

        if (statusParagraph && statusParagraph.tagName === 'P' && statusParagraph.textContent.includes('Server Key Status:')) {
            // Preserve the initial "Server Key Status:" text part.
            let statusTextPrefix = "Server Key Status:"; // Default/fallback
            if (statusParagraph.childNodes.length > 0 && statusParagraph.childNodes[0].nodeType === Node.TEXT_NODE) {
                const actualPrefix = statusParagraph.childNodes[0].textContent.trim();
                if (actualPrefix.startsWith("Server Key Status:")) {
                    statusTextPrefix = actualPrefix;
                }
            }

            // Reconstruct the HTML for the "Configured" state in demo mode
            statusParagraph.innerHTML =
                statusTextPrefix +
                ' <span style="color: green;">Configured (Demo Mode)</span> ' +
                '<small>(API calls are mocked, no real key used)</small>';
            console.log('[DemoReader] Updated Server Key Status in Settings Modal for demo mode.');
        } else {
            console.warn('[DemoReader] Could not find the Server Key Status paragraph as expected next to openai-key input.');
        }
    } else {
        console.warn('[DemoReader] Could not find OpenAI key input field (openai-key) in settings modal.');
    }

    if (modelSelect) {
        modelSelect.disabled = true;
        modelSelect.title = 'Disabled in Demo Mode';
        console.log('[DemoReader] Disabled OpenAI Model select in Settings Modal for demo mode.');
    } else {
        console.warn('[DemoReader] Could not find OpenAI model select field (openai-model) in settings modal.');
    }

    if (jpdbApiKeyInput) {
        jpdbApiKeyInput.disabled = true;
        jpdbApiKeyInput.title = 'Disabled in Demo Mode';
        // Optionally, clear the value or set a placeholder
        // jpdbApiKeyInput.value = ''; 
        // jpdbApiKeyInput.placeholder = 'Disabled in Demo';
        console.log('[DemoReader] Disabled JPDB API Key input in Settings Modal for demo mode.');
    } else {
        console.warn('[DemoReader] Could not find JPDB API Key input field (jpdb-api-key) in settings modal.');
    }

    // Set a dummy JPDB API key cookie in demo mode to prevent alerts from highlighter if it checks cookies.
    // The actual API calls are mocked, so this key is not used.
    if (window.IS_DEMO_MODE) {
        const jpdbCookie = getCookie('jpdb_api_key');
        if (!jpdbCookie || jpdbCookie.trim() === '') {
            document.cookie = "jpdb_api_key=demo_mode_key;path=/";
            console.log('[DemoReader] Set dummy jpdb_api_key cookie for demo mode.');
        }
    }
}

// Ensure initialization happens after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDemoReader);
} else {
    initDemoReader(); // Or 'interactive', 'complete'
} 
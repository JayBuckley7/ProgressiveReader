// Service Worker for Progressive Reader PWA
// TODO: generate PRECACHE_ASSETS from vite manifest hashes
//       at build-time (see scripts/pwa-manifest.js).
const CACHE_NAME = 'progressive-reader-cache-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '../css/reader_styles.css',
  'dbService.js',
  'storageManager.js',
  'epubProcessor.js',
  'themeManager.js',
  'fontSizeManager.js',
  'customCssManager.js',
  'sideDrawer.js',
  'settingsModal.js',
  'translationManager.js',
  'jlptHighlighter.js',
  'readerInit.js',
  'reader.js',
  '../dist/jp-highlighter.js',
  '../dist/jp-highlighter.css',
  'utils.js',
  '../icons/icon.png',
  '../icons/icon-192x192.png',
  '../icons/icon-512x512.png',
  '../icons/slow.gif'
];

// Install event - cache core assets
self.addEventListener('install', event => {
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        
        // Cache each asset individually to prevent one failure from stopping all caching
        return Promise.all(
          PRECACHE_ASSETS.map(url => {
            return cache.add(url).catch(error => {
              console.error('[Service Worker] Failed to cache:', url, error);
              // Continue despite the error
              return Promise.resolve();
            });
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => {
            return cacheName !== CACHE_NAME;
          }).map(cacheName => {
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network-first strategy with cache fallback
self.addEventListener('fetch', event => {
  // Handle only GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  // Skip API requests - always fetch from network
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('/metadata/')) {
    return;
  }

  // Skip caching for URLs with nocache parameter
  if (event.request.url.includes('nocache=')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Handle static files and page requests
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone the response to cache it and return it
        if (response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // If network fails, try to serve from cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // If not in cache, return offline fallback
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/');
            }
            
            return new Response('Network error', { 
              status: 408, 
              headers: { 'Content-Type': 'text/plain' } 
            });
          });
      })
  );
});

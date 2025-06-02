// Service Worker for Progressive Reader PWA
const CACHE_NAME = 'progressive-reader-cache-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/static/css/index.css',
  '/static/css/reader_styles.css',
  '/static/js/index.js',
  '/static/js/dbService.js',
  '/static/js/storageManager.js',
  '/static/js/epubProcessor.js',
  '/static/js/themeManager.js',
  '/static/js/fontSizeManager.js',
  '/static/js/customCssManager.js',
  '/static/js/sideDrawer.js',
  '/static/js/settingsModal.js',
  '/static/js/translationManager.js',
  '/static/js/jlptHighlighter.js',
  '/static/js/readerInit.js',
  '/static/js/reader.js',
  '/static/js/dist/jpHighlighter.bundle.js',
  '/static/js/dist/styles.css',
  '/static/js/utils.js',
  '/static/icons/icon.png',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/static/icons/slow.gif'
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

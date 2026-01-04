const CACHE_NAME = 'pr-v1';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/src/index.css',
  '/src/styles.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = event.request.url;
  const url = new URL(requestUrl);

  // Skip service worker interception for special URLs
  if (requestUrl.startsWith('blob:') || requestUrl.startsWith('data:')) {
    // Let the browser handle blob and data requests without interception
    return;
  }

  // Skip service worker for external URLs (CDN, etc.) - only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip service worker for PDF.js worker file (needs to load directly)
  if (requestUrl.includes('pdf.worker')) {
    return;
  }

  // Skip service worker for API endpoints that are proxied by Vite
  if (url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/drive') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/settings') ||
    url.pathname.startsWith('/metadata')) {
    // Let these requests go through the normal fetch pipeline (Vite proxy)
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

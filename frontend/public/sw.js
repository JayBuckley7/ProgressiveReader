const CACHE_NAME = 'pr-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE_ASSETS = [
  '/',
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/src/index.css'
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
  // Only handle GET requests for caching
  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache successful responses
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, copy).catch(err => {
                console.warn('Failed to cache navigate request:', err);
              });
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match(OFFLINE_URL)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Only cache successful responses for GET requests
          if (response.status === 200 && event.request.method === 'GET') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, copy).catch(err => {
                console.warn('Failed to cache request:', err);
              });
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request));
    })
  );
});

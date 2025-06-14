const CACHE_NAME = 'pr-v1';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

async function gatherDynamicAssets() {
  const assets = [...PRECACHE_ASSETS];

  try {
    const indexRes = await fetch('/index.html', { cache: 'no-store' });
    if (indexRes.ok) {
      const text = await indexRes.text();
      const regex = /\"(\/assets\/[^\"]+)\"/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        assets.push(match[1]);
      }
    }
  } catch (err) {
    console.warn('Failed to gather dynamic assets', err);
  }

  return assets;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const assets = await gatherDynamicAssets();
      await cache.addAll(assets);
    })()
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
        .catch(() => caches.match('/'))
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

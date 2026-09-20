// Minimal service worker. Its main job here is just to make the site
// installable (Chrome on Android requires an active service worker before
// it will treat "Add to Home Screen" as a real app install with its own
// standalone window, rather than a plain bookmark shortcut).
//
// As a bonus it also caches the app shell (JS/CSS/images/fonts) so the page
// itself appears instantly on a slow or waking-up connection — useful since
// the backend (Render free tier) can take 30-60s to wake from a cold start.
// It deliberately does NOT cache anything under /api/ — menu data, prices,
// and orders must always come from the network, never a stale cache.

const CACHE_NAME = 'menu-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle simple same-origin GETs; let everything else (API calls,
  // cross-origin requests, POST/PUT/DELETE) go straight to the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);

      // Cache-first for instant loads, but always refresh the cache in the
      // background so the next visit picks up new deploys.
      return cached || networkFetch;
    })
  );
});

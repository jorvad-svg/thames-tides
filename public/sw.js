// Service worker for Thames Tides
// Purpose: ensure the app always loads fresh content when opened from homescreen

const CACHE_NAME = 'thames-tides-v1';

// On install, skip waiting to activate immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

// On activate, claim all clients and clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy: always try the network, fall back to cache
// This ensures fresh content on every open while still working offline briefly
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // For API calls, always go to network (no caching)
  if (request.url.includes('/api/') || request.url.includes('environment.data.gov.uk') || request.url.includes('admiraltyapi')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache the fresh response
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request);
      })
  );
});

/**
 * MGSG Office Management — Service Worker
 *
 * Strategy:
 *  - App shell (HTML, JS, CSS) → Cache-first, update in background
 *  - API calls (/api/*)        → Network-first, fall back to cache
 *  - Static assets             → Cache-first
 *  - Offline fallback          → Served from cache when network unavailable
 */

const CACHE_NAME = 'mgsg-v1';
const OFFLINE_URL = '/offline.html';

// Resources to pre-cache on install
const PRE_CACHE = [
  '/',
  '/offline.html',
  '/manifest.json',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRE_CACHE))
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // API calls: Network-first, cache fallback (cache for 5 minutes)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, 5 * 60));
    return;
  }

  // Navigation requests: network-first, fall back to cached shell, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/');
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Static assets: Cache-first, update in background (stale-while-revalidate)
  event.respondWith(staleWhileRevalidate(request));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function networkFirstWithCache(request, maxAgeSeconds) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      cache.put(request, clone);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const dateHeader = cached.headers.get('date');
      if (dateHeader) {
        const age = (Date.now() - new Date(dateHeader).getTime()) / 1000;
        if (age < maxAgeSeconds) return cached;
      } else {
        return cached; // return anyway if no date header
      }
    }
    // Return a structured offline response for API calls
    return new Response(JSON.stringify({ message: 'You are offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || fetchPromise;
}

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'MGSG', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'MGSG Office Management', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: data.tag || 'mgsg-notification',
      data: { url: data.url || '/' },
      actions: data.actions || [],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

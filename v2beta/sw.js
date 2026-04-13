// First Light — Service Worker v6.55
const STATIC_CACHE = 'first-light-static-v6.55';
const RUNTIME_CACHE = 'first-light-runtime-v6.55';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './diary.html',
  './diary.css',
  './diary.js',
  './privacy.html',
  './manifest.json',
  './manifest-diary.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './deerschool.html',
  './deerschool.css',
  './deerschool.js',
  './questions.js',
  './diary-guide.html',
  './vendor/leaflet/leaflet.min.css',
  './vendor/leaflet/leaflet.min.js',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png'
];

// CDN libraries to precache for offline use (Leaflet is vendor-hosted — avoids Edge Tracking Prevention on cdnjs)
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Domains that should be served cache-first when offline
const CACHEABLE_ORIGINS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.destination === 'document');
}

function isStaticAsset(request, url) {
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font' || request.destination === 'image') return true;
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.png') || url.pathname.endsWith('.json') || url.pathname.endsWith('.html')) return true;
  return false;
}

function shouldBypassCaching(url) {
  if (url.pathname.includes('/v1/forecast')) return true; // weather API
  if (url.hostname.endsWith('.supabase.co')) return true; // auth/db/storage APIs
  if (url.hostname === 'nominatim.openstreetmap.org') return true; // search API
  if (url.hostname === 'api.os.uk') return true; // map API
  return false;
}

function isDeerSchoolAsset(url) {
  return (
    url.pathname.endsWith('/deerschool.html') ||
    url.pathname.endsWith('/deerschool.css') ||
    url.pathname.endsWith('/deerschool.js') ||
    url.pathname.endsWith('/questions.js')
  );
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  let networkResponse;
  try {
    networkResponse = await fetch(request);
  } catch (e) {
    networkResponse = undefined;
  }
  if (networkResponse && networkResponse.ok) {
    try {
      await cache.put(request, networkResponse.clone());
    } catch (e) { /* quota / opaque — still serve networkResponse */ }
  }
  const out = cached || networkResponse;
  return out instanceof Response ? out : new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const url = new URL(request.url);
  try {
    const network = await fetch(request);
    if (network && network.ok) {
      try {
        await cache.put(request, network.clone());
      } catch (putErr) { /* ignore */ }
    }
    return network instanceof Response ? network : new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    let fallback = await caches.match('./index.html');
    if (!fallback && isNavigationRequest(request)) {
      const lastSeg = url.pathname.replace(/\/$/, '').split('/').pop() || '';
      if (lastSeg.endsWith('.html') && lastSeg !== 'index.html') {
        fallback = await caches.match('./' + lastSeg);
      }
    }
    const out = fallback || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    return out instanceof Response ? out : new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Install: precache app shell + CDN libraries
self.addEventListener('install', async event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const allUrls = PRECACHE_URLS.concat(CDN_URLS);
      await Promise.all(
        allUrls.map(url =>
          cache.add(url).catch(e => console.warn('[SW] Failed to cache:', url, e))
        )
      );
      await self.skipWaiting();
    })()
  );
});

// Activate: delete old caches
self.addEventListener('activate', async event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Fetch handler
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // No favicon on disk — let the browser handle it (avoids SW handling missing /favicon.ico).
  if (url.pathname === '/favicon.ico') return;

  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableCDN = CACHEABLE_ORIGINS.some(d => url.hostname === d || url.hostname.endsWith('.' + d));

  if (!isSameOrigin && !isCacheableCDN) return;
  if (shouldBypassCaching(url)) return;

  event.respondWith(
    (async () => {
      try {
        let res;
        if (isNavigationRequest(request)) {
          res = await networkFirst(request, RUNTIME_CACHE);
        } else if (isSameOrigin && isDeerSchoolAsset(url)) {
          // Keep Deer School UI assets in sync on first load after updates.
          res = await networkFirst(request, STATIC_CACHE);
        } else if (isStaticAsset(request, url) || isCacheableCDN) {
          res = await staleWhileRevalidate(request, isSameOrigin ? STATIC_CACHE : RUNTIME_CACHE);
        } else {
          res = await networkFirst(request, RUNTIME_CACHE);
        }
        return res instanceof Response ? res : new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      } catch (err) {
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      }
    })()
  );
});

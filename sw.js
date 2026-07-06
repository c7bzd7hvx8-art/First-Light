// First Light — Service Worker
//
// Single version source: bump SW_VERSION and both cache names + header log
// line update automatically. Previously the comment (`v7.33`) drifted from
// the cache strings (`v7.34`) because they were three separate literals.
// Bumping triggers the `activate` step to sweep old caches and reload clients
// via the `controllerchange` path in diary.js.
const SW_VERSION = '9.50';
const STATIC_CACHE  = 'first-light-static-v'  + SW_VERSION;
const RUNTIME_CACHE = 'first-light-runtime-v' + SW_VERSION;

// Same-origin app shell — every file a diary/app/deerschool/privacy route
// needs to boot offline, plus the Leaflet vendor bundle (self-hosted because
// Edge Tracking Prevention blocks unpkg Leaflet on third-party contexts).
// Keep this list exhaustive: if a file isn't here, the very first offline
// session on a fresh device will 404 it.
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './standalone-boot.js',
  './app.js',
  './diary.html',
  './diary.css',
  './diary.js',
  // ES modules extracted from diary.js under the modularisation plan
  // (MODULARISATION-PLAN.md). Every module must be precached — a missing
  // entry here means the very first offline session on a fresh device
  // 404s the import and the app is non-functional.
  './modules/clock.mjs',
  './modules/sw-bridge.mjs',
  './modules/svg-icons.mjs',
  './modules/supabase.mjs',
  './modules/error-logger.mjs',
  './modules/profile.mjs',
  './modules/weather.mjs',
  './modules/photos.mjs',
  './modules/stats.mjs',
  './modules/pdf.mjs',
  // Pure lib statically imported by diary.js (isBlankDayEntry, blankDaySummaryText,
  // formatRelativeTime). A failed ES-module import aborts the whole diary module
  // graph, so this MUST be precached alongside the diary modules above — a miss
  // here 404s the import on a fresh device's first offline launch.
  './lib/fl-pure.mjs',
  './privacy.html',
  './terms.html',
  './manifest.json',
  './manifest-diary.json',
  './icon-152.png',
  './icon-167.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './deerschool.html',
  './deerschool.css',
  './deerschool.js',
  './questions.js',
  './diary-guide.html',
  // Per-species deer illustrations for the calculator's anatomy panel.
  // Add additional species SVGs here as they land in species/aimthedeer/.
  // Muntjac and CWD SVGs exist on disk but are intentionally NOT precached
  // (and not referenced from lib/fl-anatomy.js SPECIES_IMAGE) because both
  // species are excluded from SPECIES_BODY — the anatomy dropdown never
  // offers them. See PROJECT-LOG.md 2026-06-03 for the rationale.
  './species/aimthedeer/reddeer.svg',
  './species/aimthedeer/roedeer.svg',
  './species/aimthedeer/fallow.svg',
  './species/aimthedeer/sika.svg',
  // Ballistic calculator. Standalone — no dependency on diary state
  // or auth, but every file the calculator needs at boot must be
  // precached so the calculator is fully usable offline like the
  // rest of the app.
  './ballistics.html',
  './ballistics.css',
  './lib/fl-ballistics.js',
  './lib/fl-ammo.js',
  './lib/fl-deer-law.js',
  './lib/fl-anatomy.js',
  './lib/fl-lead-free-matcher.js',
  './data/ammo-loads.json',
  './modules/ballistics-ui.js',
  './modules/ballistics-compliance.js',
  './modules/ballistics-rangecard.js',
  './modules/ballistics-init.js',
  './modules/dope-card.js',
  'https://firstlightdeer.co.uk/species/UKDTR_logo.JPG',
  'https://firstlightdeer.co.uk/species/bds_logo.jpg',
  'https://firstlightdeer.co.uk/species/basc_logo.png',
  'https://firstlightdeer.co.uk/species/broadsideshot.jpeg',
  'https://firstlightdeer.co.uk/species/quarteringtowardsshot.jpeg',
  'https://firstlightdeer.co.uk/species/headonshot.jpeg',
  './vendor/leaflet/leaflet.min.css',
  './vendor/leaflet/leaflet.min.js',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png'
];

// Third-party CDN libraries we precache for offline use. Leaflet itself is
// self-hosted (see PRECACHE_URLS) to dodge Edge Tracking Prevention; these
// three happen to work cross-origin so we leave them on their CDN.
const CDN_URLS = [
  // Pinned + SRI-verified in diary.html/index.html (audit A3, SW 9.48). The
  // URL here must stay byte-identical to the <script src> or offline breaks.
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.106.2/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css'
];

// Domains the fetch handler is allowed to cache opportunistically
// (stale-while-revalidate). Must be a superset of the hosts in CDN_URLS
// plus the Google fonts pair — otherwise those requests get passed through
// to the network unchanged, breaking offline.
const CACHEABLE_ORIGINS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
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

async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  // Refresh runs regardless; failures are swallowed (offline is normal here).
  const revalidate = (async () => {
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
    return networkResponse;
  })();
  if (cached) {
    // Audit A7 (fixed SW 9.50): serve the cached copy IMMEDIATELY. The old
    // code awaited the network before responding and then returned the
    // cached copy anyway — every "cached" asset load was network-latency
    // bound for zero benefit (painful on rural signal). The refresh now
    // continues in the background; event.waitUntil keeps the SW alive
    // until the cache.put lands. Offline behaviour is unchanged.
    if (event && typeof event.waitUntil === 'function') {
      event.waitUntil(revalidate.catch(function() {}));
    }
    return cached;
  }
  const out = await revalidate;
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
    // Offline path. Order matters (audit A1, fixed SW 9.47):
    // 1. The cache we were handed (RUNTIME_CACHE for navigations) may hold a
    //    fresher copy than the install-time precache — check it first.
    // 2. Then ALL caches via caches.match — the precached app shell lives in
    //    STATIC_CACHE, which this function never consulted before 9.47. The
    //    old code looked up './index.html' *before* the page-specific
    //    fallback, and since index.html is always precached that lookup
    //    always won: a fresh install (or first offline launch after any SW
    //    bump — RUNTIME_CACHE is version-named, so it starts empty)
    //    navigating offline to diary.html / ballistics.html /
    //    deerschool.html got the Field Guide instead of the requested app.
    // 3. Navigations only: retry ignoring query strings (?utm=… launches),
    //    then by trailing path segment, then index.html as the last-resort
    //    shell (still needed: manifest.json start_url './' resolves to '/',
    //    which no precache key matches directly). Non-navigation misses now
    //    503 instead of receiving index.html with the wrong MIME (audit A8).
    const cached = await cache.match(request);
    if (cached) return cached;
    const anyCached = await caches.match(request);
    if (anyCached) return anyCached;
    if (isNavigationRequest(request)) {
      const ignoringSearch = await caches.match(request, { ignoreSearch: true });
      if (ignoringSearch) return ignoringSearch;
      const lastSeg = url.pathname.replace(/\/$/, '').split('/').pop() || '';
      if (lastSeg.endsWith('.html') && lastSeg !== 'index.html') {
        const bySegment = await caches.match('./' + lastSeg);
        if (bySegment) return bySegment;
      }
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
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
          res = await staleWhileRevalidate(request, isSameOrigin ? STATIC_CACHE : RUNTIME_CACHE, event);
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
